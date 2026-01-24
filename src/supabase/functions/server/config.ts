/**
 * Feature flags and configuration for Song Analyzer
 * Controls which AI services are enabled
 */

export interface FeatureConfig {
  // Transcription & Analysis
  whisper: {
    enabled: boolean;
    serviceUrl: string;
  };
  sonoteller: {
    enabled: boolean;
    rapidApiKey?: string;
    rapidApiHost: string;
  };
  openai: {
    enabled: boolean;
    apiKey?: string;
  };
}

/**
 * Load feature configuration from environment variables
 */
export function loadConfig(): FeatureConfig {
  // Get environment variables
  const whisperServiceUrl = Deno.env.get('WHISPER_SERVICE_URL') || 'http://localhost:3001';
  const sonotellerRapidKey = Deno.env.get('SONOTELLER_RAPID_KEY');
  const sonotellerRapidHost = Deno.env.get('SONOTELLER_RAPID_HOST') || 'sonoteller-ai1.p.rapidapi.com';
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  // Feature flags - can be disabled via environment variables
  const whistleEnabled = Deno.env.get('ENABLE_WHISPER') !== 'false';
  const sonotellerEnabled = Deno.env.get('ENABLE_SONOTELLER') !== 'false' && !!sonotellerRapidKey;
  const openaiEnabled = Deno.env.get('ENABLE_OPENAI') === 'true' && !!openaiApiKey;

  return {
    whisper: {
      enabled: whistleEnabled,
      serviceUrl: whisperServiceUrl,
    },
    sonoteller: {
      enabled: sonotellerEnabled,
      rapidApiKey: sonotellerRapidKey,
      rapidApiHost: sonotellerRapidHost,
    },
    openai: {
      enabled: openaiEnabled,
      apiKey: openaiApiKey,
    },
  };
}

/**
 * Check if a feature is available
 */
export function isFeatureEnabled(config: FeatureConfig, feature: keyof FeatureConfig): boolean {
  return config[feature].enabled;
}

/**
 * Get a feature's configuration
 */
export function getFeatureConfig(config: FeatureConfig, feature: keyof FeatureConfig) {
  return config[feature];
}

/**
 * Log enabled features on startup
 */
export function logEnabledFeatures(config: FeatureConfig): void {
  console.log('\n🎵 Song Analyzer Features Configuration:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Whisper Transcription: ${config.whisper.enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
  if (config.whisper.enabled) {
    console.log(`    → Service URL: ${config.whisper.serviceUrl}`);
  }
  console.log(`  Sonoteller Lyrics Analysis: ${config.sonoteller.enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
  if (config.sonoteller.enabled) {
    console.log(`    → RapidAPI Host: ${config.sonoteller.rapidApiHost}`);
  }
  console.log(`  OpenAI Features: ${config.openai.enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
