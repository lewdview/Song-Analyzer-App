import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { 
  Calendar as CalendarIcon, 
  Music, 
  Settings, 
  ArrowLeft,
  BarChart3,
  Clock,
  Check,
  AlertCircle,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Calendar } from '@/components/scheduler/Calendar';
import { PostEditor } from '@/components/scheduler/PostEditor';
import { PlatformBadge } from '@/components/scheduler/PlatformSelector';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSchedulerStore, getDayNumberFromDate } from '@/store/schedulerStore';
import { useAnalysisStore } from '@/store/analysisStore';
import { useSupabaseAPI } from '@/hooks/useSupabaseAPI';
import { CAMPAIGN_NAME, CAMPAIGN_HANDLE, POST_STATUS } from '@/config/constants';
import type { ScheduledPost, ScheduledPostCreate, ScheduledPostUpdate } from '@/types';
import { cn } from '@/components/ui/utils';
import { SocialConnectionsPanel } from '@/components/scheduler/SocialConnectionsPanel';

export function SchedulerPage() {
  // Use shallow for state to prevent unnecessary re-renders
  const {
    posts,
    selectedDate,
    selectedPost,
    isLoading: storeLoading,
    campaignStartDate,
  } = useSchedulerStore(useShallow((state) => ({
    posts: state.posts,
    selectedDate: state.selectedDate,
    selectedPost: state.selectedPost,
    isLoading: state.isLoading,
    campaignStartDate: state.campaignStartDate,
  })));

  // Get actions separately (stable references)
  const setPosts = useSchedulerStore((s) => s.setPosts);
  const addPost = useSchedulerStore((s) => s.addPost);
  const updatePost = useSchedulerStore((s) => s.updatePost);
  const removePost = useSchedulerStore((s) => s.removePost);
  const setSelectedDate = useSchedulerStore((s) => s.setSelectedDate);
  const setSelectedPost = useSchedulerStore((s) => s.setSelectedPost);
  const setCampaignStartDate = useSchedulerStore((s) => s.setCampaignStartDate);
  const setIsLoading = useSchedulerStore((s) => s.setIsLoading);

  const analyses = useAnalysisStore((state) => state.analyses);
  
  // Compute stats with useMemo
  const stats = useMemo(() => ({
    totalPosts: posts.length,
    scheduled: posts.filter((p) => p.status === POST_STATUS.SCHEDULED).length,
    published: posts.filter((p) => p.status === POST_STATUS.PUBLISHED).length,
    failed: posts.filter((p) => p.status === POST_STATUS.FAILED).length,
    draft: posts.filter((p) => p.status === POST_STATUS.DRAFT).length,
  }), [posts]);

  const {
    isLoading: apiLoading,
    error,
    loadScheduledPosts,
    createScheduledPost,
    updateScheduledPost,
    deleteScheduledPost,
    publishPost,
  } = useSupabaseAPI();

  const [showEditor, setShowEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Create a stable default date for when campaignStartDate is null
  const defaultStartDateRef = useRef(new Date());
  
  // Ensure we have a campaign start date
  const effectiveCampaignStartDate = campaignStartDate || defaultStartDateRef.current;

  // Initialize campaign start date if not set (only once)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && !campaignStartDate) {
      initializedRef.current = true;
      setCampaignStartDate(defaultStartDateRef.current);
    }
  }, [campaignStartDate, setCampaignStartDate]);

  // Load posts on mount (only once)
  useEffect(() => {
    let mounted = true;
    const loadPosts = async () => {
      setIsLoading(true);
      const loadedPosts = await loadScheduledPosts();
      if (mounted) {
        setPosts(loadedPosts);
        setIsLoading(false);
      }
    };
    loadPosts();
    return () => { mounted = false; };
  }, []); // Empty deps - only run once

  const isLoading = storeLoading || apiLoading;

  const selectedDayNumber = useMemo(() => {
    if (!selectedDate) return 1;
    return getDayNumberFromDate(selectedDate, effectiveCampaignStartDate);
  }, [selectedDate, effectiveCampaignStartDate]);

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    setSelectedPost(null);
    setShowEditor(true);
  };

  const handleSelectPost = (post: ScheduledPost) => {
    setSelectedPost(post);
    setShowEditor(true);
  };

  const handleSavePost = async (data: ScheduledPostCreate | ScheduledPostUpdate) => {
    if (selectedPost) {
      // Update existing
      const updated = await updateScheduledPost(selectedPost.id, data as ScheduledPostUpdate);
      if (updated) {
        updatePost(selectedPost.id, data as ScheduledPostUpdate);
      }
    } else {
      // Create new
      const created = await createScheduledPost(data as ScheduledPostCreate);
      if (created) {
        addPost(created);
      }
    }
    setShowEditor(false);
    setSelectedPost(null);
  };

  const handleDeletePost = async (id: string) => {
    const success = await deleteScheduledPost(id);
    if (success) {
      removePost(id);
      setShowEditor(false);
      setSelectedPost(null);
    }
  };

  const handlePublishNow = async (id: string) => {
    const success = await publishPost(id);
    if (success) {
      updatePost(id, { status: POST_STATUS.PUBLISHED });
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    const loadedPosts = await loadScheduledPosts();
    setPosts(loadedPosts);
    setIsLoading(false);
  };

  const upcomingPosts = useMemo(() => {
    const now = new Date();
    return posts
      .filter(p => new Date(p.scheduledDate) >= now && p.status === POST_STATUS.SCHEDULED)
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
      .slice(0, 5);
  }, [posts]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link 
              to="/"
              className="inline-flex items-center gap-2 text-purple-300 hover:text-white mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Analyzer
            </Link>
            <h1 className="text-white text-3xl font-bold flex items-center gap-3">
              <CalendarIcon className="w-8 h-8 text-purple-300" />
              {CAMPAIGN_NAME}
            </h1>
            <p className="text-purple-200 mt-1">
              Schedule your daily music releases with {CAMPAIGN_HANDLE}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 text-purple-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-purple-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard
            icon={<CalendarIcon className="w-5 h-5" />}
            label="Total Posts"
            value={stats.totalPosts}
            color="purple"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Scheduled"
            value={stats.scheduled}
            color="blue"
          />
          <StatCard
            icon={<Check className="w-5 h-5" />}
            label="Published"
            value={stats.published}
            color="green"
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5" />}
            label="Failed"
            value={stats.failed}
            color="red"
          />
          <StatCard
            icon={<Music className="w-5 h-5" />}
            label="Drafts"
            value={stats.draft}
            color="yellow"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2">
            <ErrorBoundary>
              <Calendar
                posts={posts}
                campaignStartDate={effectiveCampaignStartDate}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                onSelectPost={handleSelectPost}
              />
            </ErrorBoundary>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Editor or Upcoming */}
            {showEditor ? (
              <ErrorBoundary>
                <PostEditor
                  post={selectedPost}
                  selectedDate={selectedDate}
                  dayNumber={selectedDayNumber}
                  songs={analyses}
                  onSave={handleSavePost}
                  onDelete={handleDeletePost}
                  onPublishNow={handlePublishNow}
                  onClose={() => {
                    setShowEditor(false);
                    setSelectedPost(null);
                  }}
                  isLoading={isLoading}
                />
              </ErrorBoundary>
            ) : (
              <>
                {/* Quick Add */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <button
                    onClick={() => {
                      setSelectedDate(new Date());
                      setSelectedPost(null);
                      setShowEditor(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Schedule New Post
                  </button>
                </div>

                {/* Upcoming Posts */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-300" />
                    Upcoming Posts
                  </h3>
                  {upcomingPosts.length > 0 ? (
                    <div className="space-y-3">
                      {upcomingPosts.map((post) => (
                        <button
                          key={post.id}
                          onClick={() => handleSelectPost(post)}
                          className="w-full text-left p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white text-sm font-medium truncate">
                              Day {post.dayNumber}: {post.songName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-purple-300 text-xs">
                            <span>{new Date(post.scheduledDate).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{post.scheduledTime}</span>
                          </div>
                          <div className="flex gap-1 mt-2">
                            {post.platforms.map((platformId) => (
                              <PlatformBadge
                                key={platformId}
                                platformId={platformId}
                                size="sm"
                              />
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-purple-300 text-sm text-center py-4">
                      No upcoming posts scheduled
                    </p>
                  )}
                </div>

                {/* Quick Stats */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-300" />
                    Progress
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-purple-200">Days Completed</span>
                        <span className="text-white">
                          {stats.published} / 365
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${(stats.published / 365) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-purple-200">Days Scheduled</span>
                        <span className="text-white">
                          {stats.scheduled + stats.published} / 365
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${((stats.scheduled + stats.published) / 365) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg">
            {error}
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <CampaignSettings
            startDate={campaignStartDate || new Date()}
            onSave={(date) => {
              setCampaignStartDate(date);
              setShowSettings(false);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'purple' | 'blue' | 'green' | 'red' | 'yellow';
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  const colorClasses = {
    purple: 'bg-purple-500/20 border-purple-400/30 text-purple-300',
    blue: 'bg-blue-500/20 border-blue-400/30 text-blue-300',
    green: 'bg-green-500/20 border-green-400/30 text-green-300',
    red: 'bg-red-500/20 border-red-400/30 text-red-300',
    yellow: 'bg-yellow-500/20 border-yellow-400/30 text-yellow-300',
  };

  return (
    <div className={cn('rounded-lg p-4 border', colorClasses[color])}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  );
}

interface CampaignSettingsProps {
  startDate: Date;
  onSave: (date: Date) => void;
  onClose: () => void;
}

function CampaignSettings({ startDate, onSave, onClose }: CampaignSettingsProps) {
  const [date, setDate] = useState(startDate.toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'campaign' | 'social'>('campaign');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header with Tabs */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('campaign')}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === 'campaign'
                  ? 'bg-purple-500 text-white'
                  : 'text-purple-200 hover:bg-white/10'
              )}
            >
              Campaign Settings
            </button>
            <button
              onClick={() => setActiveTab('social')}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === 'social'
                  ? 'bg-purple-500 text-white'
                  : 'text-purple-200 hover:bg-white/10'
              )}
            >
              Social Accounts
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'campaign' ? (
            <div>
              <h3 className="text-white font-medium mb-4">Campaign Configuration</h3>
              <div className="mb-6">
                <label className="block text-purple-200 text-sm mb-2">
                  Campaign Start Date
                </label>
                <input
                  type="date"
                  value={date ?? ''}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400"
                />
                <p className="text-purple-300 text-xs mt-2">
                  Day 1 of your 365 Days of Light and Dark campaign
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => date && onSave(new Date(date))}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <SocialConnectionsPanel />
          )}
        </div>
      </div>
    </div>
  );
}

export default SchedulerPage;
