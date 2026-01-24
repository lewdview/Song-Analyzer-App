/**
 * Social Media Service - 365 Days of Light and Dark with th3scr1b3
 * 
 * Provides adapters for publishing to various social media platforms.
 * Each platform has its own adapter implementing the common interface.
 */

import { logger } from '@/utils/logger';
import { SOCIAL_PLATFORMS, CAMPAIGN_HASHTAG, CAMPAIGN_HANDLE } from '@/config/constants';
import type { SocialPlatformId, PublishResult, ScheduledPost } from '@/types';

const log = logger.scope('SocialMedia');

// ============================================================================
// Base Types
// ============================================================================

export interface MediaContent {
  type: 'audio' | 'video' | 'image';
  url: string;
  mimeType: string;
  filename: string;
  size: number;
}

export interface PostContent {
  caption: string;
  hashtags: string[];
  media?: MediaContent;
  scheduledTime?: Date;
}

export interface PlatformCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// ============================================================================
// Platform Adapter Interface
// ============================================================================

export interface SocialMediaAdapter {
  platformId: SocialPlatformId;
  name: string;
  
  // Authentication
  getAuthUrl(): Promise<string>;
  handleCallback(code: string): Promise<PlatformCredentials>;
  refreshToken(credentials: PlatformCredentials): Promise<PlatformCredentials>;
  validateCredentials(credentials: PlatformCredentials): Promise<boolean>;
  
  // Publishing
  publish(content: PostContent, credentials: PlatformCredentials): Promise<PublishResult>;
  
  // Optional: Platform-specific features
  getCharacterLimit(): number;
  supportsScheduling(): boolean;
  getMediaRequirements(): {
    maxSize: number;
    supportedTypes: string[];
    aspectRatios?: string[];
  };
}

// ============================================================================
// Platform Adapters
// ============================================================================

/**
 * Twitter/X Adapter
 */
export class TwitterAdapter implements SocialMediaAdapter {
  platformId: SocialPlatformId = 'twitter';
  name = 'X (Twitter)';

  async getAuthUrl(): Promise<string> {
    // In production, this would generate Twitter OAuth 2.0 URL
    const clientId = import.meta.env.VITE_TWITTER_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/twitter/callback`;
    const scope = 'tweet.read tweet.write users.read offline.access';
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId || '',
      redirect_uri: redirectUri,
      scope,
      state: crypto.randomUUID(),
      code_challenge: 'challenge', // Should use PKCE in production
      code_challenge_method: 'plain',
    });

    return `https://twitter.com/i/oauth2/authorize?${params}`;
  }

  async handleCallback(code: string): Promise<PlatformCredentials> {
    log.info('Handling Twitter OAuth callback');
    // Exchange code for tokens via backend
    // This is a placeholder - actual implementation would call the backend
    return {
      accessToken: '',
      refreshToken: '',
      expiresAt: new Date(Date.now() + 7200000), // 2 hours
    };
  }

  async refreshToken(credentials: PlatformCredentials): Promise<PlatformCredentials> {
    log.info('Refreshing Twitter access token');
    // Refresh via backend
    return credentials;
  }

  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    // Verify token is still valid
    return !!credentials.accessToken;
  }

  async publish(content: PostContent, credentials: PlatformCredentials): Promise<PublishResult> {
    log.info('Publishing to Twitter');
    
    try {
      // Format caption with hashtags
      const text = this.formatCaption(content);
      
      // In production, this would call Twitter API via backend
      // POST https://api.twitter.com/2/tweets
      
      return {
        platformId: this.platformId,
        success: true,
        postId: crypto.randomUUID(),
        postUrl: 'https://twitter.com/i/status/example',
      };
    } catch (error) {
      log.error('Twitter publish failed', error);
      return {
        platformId: this.platformId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  formatCaption(content: PostContent): string {
    const hashtags = [...content.hashtags, CAMPAIGN_HASHTAG].join(' ');
    let text = `${content.caption}\n\n${hashtags}`;
    
    // Truncate if too long
    if (text.length > 280) {
      text = text.substring(0, 277) + '...';
    }
    
    return text;
  }

  getCharacterLimit(): number {
    return 280;
  }

  supportsScheduling(): boolean {
    return false; // Twitter doesn't natively support scheduling via API
  }

  getMediaRequirements() {
    return {
      maxSize: 512 * 1024 * 1024, // 512MB for video
      supportedTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
      aspectRatios: ['16:9', '1:1'],
    };
  }
}

/**
 * Instagram Adapter
 */
export class InstagramAdapter implements SocialMediaAdapter {
  platformId: SocialPlatformId = 'instagram';
  name = 'Instagram';

  async getAuthUrl(): Promise<string> {
    const clientId = import.meta.env.VITE_INSTAGRAM_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/instagram/callback`;
    
    const params = new URLSearchParams({
      client_id: clientId || '',
      redirect_uri: redirectUri,
      scope: 'instagram_basic,instagram_content_publish',
      response_type: 'code',
    });

    return `https://api.instagram.com/oauth/authorize?${params}`;
  }

  async handleCallback(code: string): Promise<PlatformCredentials> {
    log.info('Handling Instagram OAuth callback');
    return {
      accessToken: '',
      refreshToken: '',
    };
  }

  async refreshToken(credentials: PlatformCredentials): Promise<PlatformCredentials> {
    return credentials;
  }

  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    return !!credentials.accessToken;
  }

  async publish(content: PostContent, credentials: PlatformCredentials): Promise<PublishResult> {
    log.info('Publishing to Instagram');
    
    if (!content.media) {
      return {
        platformId: this.platformId,
        success: false,
        error: 'Instagram requires media content',
      };
    }

    try {
      // Instagram Graph API requires:
      // 1. Create media container
      // 2. Publish media container
      
      return {
        platformId: this.platformId,
        success: true,
        postId: crypto.randomUUID(),
        postUrl: 'https://instagram.com/p/example',
      };
    } catch (error) {
      log.error('Instagram publish failed', error);
      return {
        platformId: this.platformId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getCharacterLimit(): number {
    return 2200;
  }

  supportsScheduling(): boolean {
    return true;
  }

  getMediaRequirements() {
    return {
      maxSize: 4 * 1024 * 1024 * 1024, // 4GB for video
      supportedTypes: ['image/jpeg', 'video/mp4'],
      aspectRatios: ['1:1', '4:5', '9:16'],
    };
  }
}

/**
 * TikTok Adapter
 */
export class TikTokAdapter implements SocialMediaAdapter {
  platformId: SocialPlatformId = 'tiktok';
  name = 'TikTok';

  async getAuthUrl(): Promise<string> {
    const clientKey = import.meta.env.VITE_TIKTOK_CLIENT_KEY;
    const redirectUri = `${window.location.origin}/auth/tiktok/callback`;
    
    const params = new URLSearchParams({
      client_key: clientKey || '',
      redirect_uri: redirectUri,
      scope: 'video.upload,video.publish',
      response_type: 'code',
    });

    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  }

  async handleCallback(code: string): Promise<PlatformCredentials> {
    log.info('Handling TikTok OAuth callback');
    return { accessToken: '' };
  }

  async refreshToken(credentials: PlatformCredentials): Promise<PlatformCredentials> {
    return credentials;
  }

  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    return !!credentials.accessToken;
  }

  async publish(content: PostContent, credentials: PlatformCredentials): Promise<PublishResult> {
    log.info('Publishing to TikTok');
    
    if (!content.media || content.media.type !== 'video') {
      return {
        platformId: this.platformId,
        success: false,
        error: 'TikTok requires video content',
      };
    }

    try {
      return {
        platformId: this.platformId,
        success: true,
        postId: crypto.randomUUID(),
        postUrl: 'https://tiktok.com/@user/video/example',
      };
    } catch (error) {
      log.error('TikTok publish failed', error);
      return {
        platformId: this.platformId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getCharacterLimit(): number {
    return 2200;
  }

  supportsScheduling(): boolean {
    return false;
  }

  getMediaRequirements() {
    return {
      maxSize: 4 * 1024 * 1024 * 1024,
      supportedTypes: ['video/mp4'],
      aspectRatios: ['9:16'],
    };
  }
}

/**
 * YouTube Adapter
 */
export class YouTubeAdapter implements SocialMediaAdapter {
  platformId: SocialPlatformId = 'youtube';
  name = 'YouTube';

  async getAuthUrl(): Promise<string> {
    const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/youtube/callback`;
    
    const params = new URLSearchParams({
      client_id: clientId || '',
      redirect_uri: redirectUri,
      scope: 'https://www.googleapis.com/auth/youtube.upload',
      response_type: 'code',
      access_type: 'offline',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleCallback(code: string): Promise<PlatformCredentials> {
    log.info('Handling YouTube OAuth callback');
    return { accessToken: '' };
  }

  async refreshToken(credentials: PlatformCredentials): Promise<PlatformCredentials> {
    return credentials;
  }

  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    return !!credentials.accessToken;
  }

  async publish(content: PostContent, credentials: PlatformCredentials): Promise<PublishResult> {
    log.info('Publishing to YouTube');
    
    try {
      return {
        platformId: this.platformId,
        success: true,
        postId: crypto.randomUUID(),
        postUrl: 'https://youtube.com/watch?v=example',
      };
    } catch (error) {
      log.error('YouTube publish failed', error);
      return {
        platformId: this.platformId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getCharacterLimit(): number {
    return 5000;
  }

  supportsScheduling(): boolean {
    return true;
  }

  getMediaRequirements() {
    return {
      maxSize: 256 * 1024 * 1024 * 1024, // 256GB
      supportedTypes: ['video/mp4', 'video/webm'],
      aspectRatios: ['16:9', '9:16'],
    };
  }
}

/**
 * Facebook Adapter
 */
export class FacebookAdapter implements SocialMediaAdapter {
  platformId: SocialPlatformId = 'facebook';
  name = 'Facebook';

  async getAuthUrl(): Promise<string> {
    const clientId = import.meta.env.VITE_FACEBOOK_CLIENT_ID;
    const redirectUri = `${window.location.origin}/auth/facebook/callback`;
    
    const params = new URLSearchParams({
      client_id: clientId || '',
      redirect_uri: redirectUri,
      scope: 'pages_manage_posts,pages_read_engagement',
      response_type: 'code',
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params}`;
  }

  async handleCallback(code: string): Promise<PlatformCredentials> {
    log.info('Handling Facebook OAuth callback');
    return { accessToken: '' };
  }

  async refreshToken(credentials: PlatformCredentials): Promise<PlatformCredentials> {
    return credentials;
  }

  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    return !!credentials.accessToken;
  }

  async publish(content: PostContent, credentials: PlatformCredentials): Promise<PublishResult> {
    log.info('Publishing to Facebook');
    
    try {
      return {
        platformId: this.platformId,
        success: true,
        postId: crypto.randomUUID(),
        postUrl: 'https://facebook.com/post/example',
      };
    } catch (error) {
      log.error('Facebook publish failed', error);
      return {
        platformId: this.platformId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getCharacterLimit(): number {
    return 63206;
  }

  supportsScheduling(): boolean {
    return true;
  }

  getMediaRequirements() {
    return {
      maxSize: 10 * 1024 * 1024 * 1024, // 10GB
      supportedTypes: ['image/jpeg', 'image/png', 'video/mp4'],
    };
  }
}

// ============================================================================
// Social Media Service
// ============================================================================

class SocialMediaService {
  private adapters: Map<SocialPlatformId, SocialMediaAdapter> = new Map();

  constructor() {
    // Register all adapters
    this.registerAdapter(new TwitterAdapter());
    this.registerAdapter(new InstagramAdapter());
    this.registerAdapter(new TikTokAdapter());
    this.registerAdapter(new YouTubeAdapter());
    this.registerAdapter(new FacebookAdapter());
  }

  registerAdapter(adapter: SocialMediaAdapter): void {
    this.adapters.set(adapter.platformId, adapter);
  }

  getAdapter(platformId: SocialPlatformId): SocialMediaAdapter | undefined {
    return this.adapters.get(platformId);
  }

  getAllAdapters(): SocialMediaAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Publish to multiple platforms
   */
  async publishToMultiple(
    content: PostContent,
    platforms: SocialPlatformId[],
    credentials: Record<SocialPlatformId, PlatformCredentials>
  ): Promise<PublishResult[]> {
    const results: PublishResult[] = [];

    for (const platformId of platforms) {
      const adapter = this.getAdapter(platformId);
      const platformCredentials = credentials[platformId];

      if (!adapter) {
        results.push({
          platformId,
          success: false,
          error: `No adapter found for ${platformId}`,
        });
        continue;
      }

      if (!platformCredentials) {
        results.push({
          platformId,
          success: false,
          error: `No credentials for ${platformId}`,
        });
        continue;
      }

      const result = await adapter.publish(content, platformCredentials);
      results.push(result);
    }

    return results;
  }

  /**
   * Generate caption for 365 Days campaign
   */
  generateCampaignCaption(
    dayNumber: number,
    songName: string,
    customCaption?: string
  ): string {
    const defaultCaption = `Day ${dayNumber}/365: "${songName}"\n\n${CAMPAIGN_NAME} with ${CAMPAIGN_HANDLE}`;
    return customCaption || defaultCaption;
  }

  /**
   * Get default hashtags for the campaign
   */
  getCampaignHashtags(): string[] {
    return [
      '365DaysOfLightAndDark',
      'th3scr1b3',
      'MusicEveryDay',
      'IndieMusic',
      'NewMusic',
    ];
  }
}

// Export singleton instance
export const socialMediaService = new SocialMediaService();
export default socialMediaService;
