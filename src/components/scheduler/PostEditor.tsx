import { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Clock, Hash, Save, Send, Trash2 } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { PlatformSelector } from './PlatformSelector';
import { CAMPAIGN_NAME, CAMPAIGN_HANDLE, POST_STATUS } from '@/config/constants';
import { socialMediaService } from '@/services/socialMedia';
import type { ScheduledPost, ScheduledPostCreate, ScheduledPostUpdate, SongAnalysis, SocialPlatformId } from '@/types';

interface PostEditorProps {
  post?: ScheduledPost | null;
  selectedDate?: Date | null;
  dayNumber: number;
  songs: SongAnalysis[];
  onSave: (post: ScheduledPostCreate | ScheduledPostUpdate) => void;
  onDelete?: (id: string) => void;
  onPublishNow?: (id: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export function PostEditor({
  post,
  selectedDate,
  dayNumber,
  songs,
  onSave,
  onDelete,
  onPublishNow,
  onClose,
  isLoading = false,
}: PostEditorProps) {
  const isEditing = !!post;
  
  const [selectedSongId, setSelectedSongId] = useState(post?.songId || '');
  const [platforms, setPlatforms] = useState<SocialPlatformId[]>(post?.platforms || []);
  const [scheduledDate, setScheduledDate] = useState(
    post?.scheduledDate?.split('T')[0] || 
    selectedDate?.toISOString().split('T')[0] || 
    new Date().toISOString().split('T')[0]
  );
  const [scheduledTime, setScheduledTime] = useState(post?.scheduledTime || '12:00');
  const [caption, setCaption] = useState(post?.caption || '');
  const [hashtags, setHashtags] = useState<string[]>(
    post?.hashtags || socialMediaService.getCampaignHashtags()
  );
  const [newHashtag, setNewHashtag] = useState('');

  // Update caption when song changes
  useEffect(() => {
    if (selectedSongId && !isEditing) {
      const song = songs.find(s => s.id === selectedSongId);
      if (song) {
        const generatedCaption = socialMediaService.generateCampaignCaption(
          dayNumber,
          song.fileName.replace(/\.[^/.]+$/, ''),
        );
        setCaption(generatedCaption);
      }
    }
  }, [selectedSongId, dayNumber, songs, isEditing]);

  const selectedSong = songs.find(s => s.id === selectedSongId);

  const handleAddHashtag = () => {
    if (newHashtag && !hashtags.includes(newHashtag)) {
      setHashtags([...hashtags, newHashtag.replace(/^#/, '')]);
      setNewHashtag('');
    }
  };

  const handleRemoveHashtag = (tag: string) => {
    setHashtags(hashtags.filter(h => h !== tag));
  };

  const handleSave = () => {
    if (!selectedSongId || platforms.length === 0) return;

    if (isEditing && post) {
      const updates: ScheduledPostUpdate = {
        platforms,
        scheduledDate: scheduledDate ?? undefined,
        scheduledTime,
        caption,
        hashtags,
        status: post.status,
      };
      onSave(updates);
    } else {
      const newPost: ScheduledPostCreate = {
        songId: selectedSongId,
        songName: selectedSong?.fileName.replace(/\.[^/.]+$/, '') || 'Unknown',
        platforms,
        scheduledDate: scheduledDate ?? new Date().toISOString().split('T')[0] ?? '',
        scheduledTime,
        caption,
        hashtags,
        dayNumber,
      };
      onSave(newPost);
    }
  };

  const canSave = selectedSongId && platforms.length > 0 && caption;

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h3 className="text-white font-medium">
          {isEditing ? 'Edit Post' : `Schedule Day ${dayNumber}`}
        </h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
        {/* Song Selection */}
        <div>
          <label className="block text-purple-200 text-sm mb-2">Song</label>
          <select
            value={selectedSongId}
            onChange={(e) => setSelectedSongId(e.target.value)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400"
            disabled={isLoading}
          >
            <option value="">Select a song...</option>
            {songs.map((song) => (
              <option key={song.id} value={song.id} className="bg-gray-800">
                {song.fileName}
              </option>
            ))}
          </select>
        </div>

        {/* Platform Selection */}
        <div>
          <label className="block text-purple-200 text-sm mb-2">Platforms</label>
          <PlatformSelector
            selected={platforms}
            onChange={setPlatforms}
            disabled={isLoading}
          />
        </div>

        {/* Date and Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-purple-200 text-sm mb-2">
              <CalendarIcon className="w-4 h-4 inline mr-1" />
              Date
            </label>
            <input
              type="date"
              value={scheduledDate ?? ''}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-purple-200 text-sm mb-2">
              <Clock className="w-4 h-4 inline mr-1" />
              Time
            </label>
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Caption */}
        <div>
          <label className="block text-purple-200 text-sm mb-2">Caption</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400 resize-none"
            placeholder={`Day ${dayNumber}/365: Your song title\n\n${CAMPAIGN_NAME} with ${CAMPAIGN_HANDLE}`}
            disabled={isLoading}
          />
          <p className="text-purple-300 text-xs mt-1">
            {caption.length} characters
          </p>
        </div>

        {/* Hashtags */}
        <div>
          <label className="block text-purple-200 text-sm mb-2">
            <Hash className="w-4 h-4 inline mr-1" />
            Hashtags
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {hashtags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-200 rounded text-sm"
              >
                #{tag}
                <button
                  onClick={() => handleRemoveHashtag(tag)}
                  className="hover:text-red-300"
                  disabled={isLoading}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newHashtag}
              onChange={(e) => setNewHashtag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddHashtag())}
              placeholder="Add hashtag..."
              className="flex-1 px-3 py-1 bg-white/5 border border-white/10 rounded text-white text-sm focus:outline-none focus:border-purple-400"
              disabled={isLoading}
            />
            <button
              onClick={handleAddHashtag}
              className="px-3 py-1 bg-purple-500/20 text-purple-200 rounded text-sm hover:bg-purple-500/30"
              disabled={isLoading}
            >
              Add
            </button>
          </div>
        </div>

        {/* Post Status (if editing) */}
        {isEditing && post && (
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-purple-200 text-sm">
              Status:{' '}
              <span className={cn(
                'font-medium',
                post.status === POST_STATUS.PUBLISHED && 'text-green-400',
                post.status === POST_STATUS.SCHEDULED && 'text-blue-400',
                post.status === POST_STATUS.DRAFT && 'text-yellow-400',
                post.status === POST_STATUS.FAILED && 'text-red-400'
              )}>
                {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
              </span>
            </p>
            {post.error && (
              <p className="text-red-300 text-xs mt-1">Error: {post.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between p-4 border-t border-white/10 bg-white/5">
        <div>
          {isEditing && onDelete && (
            <button
              onClick={() => onDelete(post!.id)}
              className="flex items-center gap-2 px-3 py-2 text-red-300 hover:text-red-200 hover:bg-red-500/10 rounded transition-colors"
              disabled={isLoading}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
        <div className="flex gap-3">
          {isEditing && onPublishNow && post?.status !== POST_STATUS.PUBLISHED && (
            <button
              onClick={() => onPublishNow(post!.id)}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              <Send className="w-4 h-4" />
              Publish Now
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isEditing ? 'Update' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PostEditor;
