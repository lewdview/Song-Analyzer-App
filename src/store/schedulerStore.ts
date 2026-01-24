import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { ScheduledPost, ScheduledPostUpdate, SocialPlatformConnection } from '@/types';
import { POST_STATUS } from '@/config/constants';

interface SchedulerStoreState {
  posts: ScheduledPost[];
  selectedDate: Date | null;
  selectedPost: ScheduledPost | null;
  isLoading: boolean;
  connectedPlatforms: SocialPlatformConnection[];
  campaignStartDate: Date | null;
}

interface SchedulerStoreActions {
  // Posts
  setPosts: (posts: ScheduledPost[]) => void;
  addPost: (post: ScheduledPost) => void;
  updatePost: (id: string, updates: ScheduledPostUpdate) => void;
  removePost: (id: string) => void;
  
  // Selection
  setSelectedDate: (date: Date | null) => void;
  setSelectedPost: (post: ScheduledPost | null) => void;
  
  // Loading
  setIsLoading: (value: boolean) => void;
  
  // Platforms
  setConnectedPlatforms: (platforms: SocialPlatformConnection[]) => void;
  updatePlatformConnection: (platformId: string, updates: Partial<SocialPlatformConnection>) => void;
  
  // Campaign
  setCampaignStartDate: (date: Date) => void;
  
  // Reset
  reset: () => void;
}

type SchedulerStore = SchedulerStoreState & SchedulerStoreActions;

const initialState: SchedulerStoreState = {
  posts: [],
  selectedDate: null,
  selectedPost: null,
  isLoading: false,
  connectedPlatforms: [],
  campaignStartDate: null,
};

export const useSchedulerStore = create<SchedulerStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Posts actions
        setPosts: (posts) => set({ posts }, false, 'setPosts'),
        
        addPost: (post) =>
          set(
            (state) => ({ posts: [...state.posts, post] }),
            false,
            'addPost'
          ),
        
        updatePost: (id, updates) =>
          set(
            (state) => ({
              posts: state.posts.map((post) =>
                post.id === id
                  ? { ...post, ...updates, updatedAt: new Date().toISOString() }
                  : post
              ),
              selectedPost:
                state.selectedPost?.id === id
                  ? { ...state.selectedPost, ...updates, updatedAt: new Date().toISOString() }
                  : state.selectedPost,
            }),
            false,
            'updatePost'
          ),
        
        removePost: (id) =>
          set(
            (state) => ({
              posts: state.posts.filter((post) => post.id !== id),
              selectedPost: state.selectedPost?.id === id ? null : state.selectedPost,
            }),
            false,
            'removePost'
          ),

        // Selection actions
        setSelectedDate: (selectedDate) => set({ selectedDate }, false, 'setSelectedDate'),
        setSelectedPost: (selectedPost) => set({ selectedPost }, false, 'setSelectedPost'),

        // Loading
        setIsLoading: (isLoading) => set({ isLoading }, false, 'setIsLoading'),

        // Platforms actions
        setConnectedPlatforms: (connectedPlatforms) =>
          set({ connectedPlatforms }, false, 'setConnectedPlatforms'),
        
        updatePlatformConnection: (platformId, updates) =>
          set(
            (state) => ({
              connectedPlatforms: state.connectedPlatforms.map((platform) =>
                platform.platformId === platformId
                  ? { ...platform, ...updates }
                  : platform
              ),
            }),
            false,
            'updatePlatformConnection'
          ),

        // Campaign
        setCampaignStartDate: (campaignStartDate) =>
          set({ campaignStartDate }, false, 'setCampaignStartDate'),

        // Reset
        reset: () => set(initialState, false, 'reset'),
      }),
      {
        name: 'scheduler-store',
        partialize: (state) => ({
          posts: state.posts,
          connectedPlatforms: state.connectedPlatforms,
          campaignStartDate: state.campaignStartDate,
        }),
        // Rehydrate dates from strings (JSON serialization converts Date to string)
        onRehydrateStorage: () => (state) => {
          if (state?.campaignStartDate && typeof state.campaignStartDate === 'string') {
            state.campaignStartDate = new Date(state.campaignStartDate);
          }
        },
      }
    ),
    { name: 'scheduler-store' }
  )
);

// Selectors
export const selectPosts = (state: SchedulerStore) => state.posts;
export const selectSelectedDate = (state: SchedulerStore) => state.selectedDate;
export const selectSelectedPost = (state: SchedulerStore) => state.selectedPost;
export const selectIsLoading = (state: SchedulerStore) => state.isLoading;
export const selectConnectedPlatforms = (state: SchedulerStore) => state.connectedPlatforms;
export const selectCampaignStartDate = (state: SchedulerStore) => state.campaignStartDate;

export const selectPostsByDate = (date: Date) => (state: SchedulerStore) => {
  const dateStr = date.toISOString().split('T')[0];
  return state.posts.filter((post) => post.scheduledDate.startsWith(dateStr ?? ''));
};

export const selectPostByDayNumber = (dayNumber: number) => (state: SchedulerStore) => {
  return state.posts.find((post) => post.dayNumber === dayNumber);
};

export const selectUpcomingPosts = (limit = 10) => (state: SchedulerStore) => {
  const now = new Date();
  return state.posts
    .filter((post) => {
      const postDate = new Date(post.scheduledDate);
      return postDate >= now && post.status === POST_STATUS.SCHEDULED;
    })
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
    .slice(0, limit);
};

export const selectSchedulerStats = (state: SchedulerStore) => {
  const posts = state.posts;
  return {
    totalPosts: posts.length,
    scheduled: posts.filter((p) => p.status === POST_STATUS.SCHEDULED).length,
    published: posts.filter((p) => p.status === POST_STATUS.PUBLISHED).length,
    failed: posts.filter((p) => p.status === POST_STATUS.FAILED).length,
    draft: posts.filter((p) => p.status === POST_STATUS.DRAFT).length,
  };
};

// Helper to get day number from date based on campaign start
export const getDayNumberFromDate = (date: Date, campaignStart: Date): number => {
  const diffTime = date.getTime() - campaignStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // Day 1 is the start date
};

// Helper to get date from day number
export const getDateFromDayNumber = (dayNumber: number, campaignStart: Date): Date => {
  const date = new Date(campaignStart);
  date.setDate(date.getDate() + dayNumber - 1);
  return date;
};
