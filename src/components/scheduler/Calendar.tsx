import { useMemo, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, Music, Check, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { POST_STATUS } from '@/config/constants';
import type { ScheduledPost, CalendarDay } from '@/types';

interface CalendarProps {
  posts: ScheduledPost[];
  campaignStartDate: Date;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onSelectPost: (post: ScheduledPost) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Get today's date string for comparison (stable across renders)
function getTodayString(): string {
  const today = new Date();
  return `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
}

// Get selected date string for comparison
function getDateString(date: Date | null): string {
  if (!date) return '';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function Calendar({
  posts,
  campaignStartDate,
  selectedDate,
  onSelectDate,
  onSelectPost,
}: CalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date());
  
  // Ensure campaignStartDate is a Date object (may be string from localStorage)
  const normalizedCampaignStart = useMemo(() => {
    if (campaignStartDate instanceof Date) {
      return campaignStartDate;
    }
    // Handle string dates from localStorage rehydration
    if (typeof campaignStartDate === 'string') {
      return new Date(campaignStartDate);
    }
    return new Date();
  }, [campaignStartDate]);
  
  // Stable reference to campaign start timestamp for comparison
  const campaignStartTime = normalizedCampaignStart.getTime();
  
  // Convert selectedDate to string for stable comparison
  const selectedDateStr = getDateString(selectedDate);

  const { calendarDays, monthLabel } = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    // First day of month
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    
    // Last day of month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Build calendar grid
    const days: CalendarDay[] = [];
    const todayStr = getTodayString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();
    
    // Campaign start for day number calculation
    const campStart = new Date(campaignStartTime);
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      const date = new Date(year, month, -startingDayOfWeek + i + 1);
      days.push(createCalendarDaySimple(date, campStart, posts, todayTime, selectedDateStr));
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push(createCalendarDaySimple(date, campStart, posts, todayTime, selectedDateStr));
    }
    
    // Add days after the month to complete the grid (6 rows)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push(createCalendarDaySimple(date, campStart, posts, todayTime, selectedDateStr));
    }
    
    return {
      calendarDays: days,
      monthLabel: `${MONTHS[month]} ${year}`,
    };
  }, [viewDate, posts, campaignStartTime, selectedDateStr]);

  const goToPreviousMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setViewDate(new Date());
  };

  return (
    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-white text-lg font-medium">{monthLabel}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm text-purple-300 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToPreviousMonth}
            className="p-2 text-purple-300 hover:text-white hover:bg-white/10 rounded transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-2 text-purple-300 hover:text-white hover:bg-white/10 rounded transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(7, 1fr)', 
          gap: '4px',
          marginBottom: '8px' 
        }}
      >
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-center text-purple-300 text-sm py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(7, 1fr)', 
          gap: '4px' 
        }}
      >
        {calendarDays.map((day, index) => (
          <CalendarDayCell
            key={index}
            day={day}
            isCurrentMonth={day.date.getMonth() === viewDate.getMonth()}
            onSelect={() => onSelectDate(day.date)}
            onSelectPost={() => day.post && onSelectPost(day.post)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-purple-200">Published</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-purple-200">Scheduled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-purple-200">Draft</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-purple-200">Failed</span>
        </div>
      </div>
    </div>
  );
}

interface CalendarDayCellProps {
  day: CalendarDay;
  isCurrentMonth: boolean;
  onSelect: () => void;
  onSelectPost: () => void;
}

function CalendarDayCell({ day, isCurrentMonth, onSelect, onSelectPost }: CalendarDayCellProps) {
  const statusColors = {
    [POST_STATUS.PUBLISHED]: 'bg-green-500',
    [POST_STATUS.SCHEDULED]: 'bg-blue-500',
    [POST_STATUS.DRAFT]: 'bg-yellow-500',
    [POST_STATUS.FAILED]: 'bg-red-500',
    [POST_STATUS.PUBLISHING]: 'bg-purple-500',
    [POST_STATUS.CANCELLED]: 'bg-gray-500',
  };

  const StatusIcon = day.post ? {
    [POST_STATUS.PUBLISHED]: Check,
    [POST_STATUS.SCHEDULED]: Clock,
    [POST_STATUS.DRAFT]: Music,
    [POST_STATUS.FAILED]: AlertCircle,
    [POST_STATUS.PUBLISHING]: Clock,
    [POST_STATUS.CANCELLED]: AlertCircle,
  }[day.post.status] : null;

  return (
    <button
      onClick={day.post ? onSelectPost : onSelect}
      className={cn(
        'aspect-square p-1 rounded-lg transition-all relative',
        'hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-purple-400',
        isCurrentMonth ? 'text-white' : 'text-gray-500',
        day.isToday && 'ring-2 ring-purple-400',
        day.isSelected && 'bg-purple-500/20',
        day.isPast && !day.post && 'opacity-50'
      )}
      aria-label={`${day.date.toDateString()}${day.post ? `, Day ${day.dayNumber}, ${day.post.status}` : ''}`}
    >
      <div className="h-full flex flex-col">
        {/* Day number */}
        <span className={cn(
          'text-sm',
          day.isToday && 'font-bold text-purple-300'
        )}>
          {day.date.getDate()}
        </span>

        {/* Day of campaign */}
        {day.dayNumber > 0 && day.dayNumber <= 365 && (
          <span className="text-xs text-purple-400 mt-auto">
            D{day.dayNumber}
          </span>
        )}

        {/* Post indicator */}
        {day.post && (
          <div
            className={cn(
              'absolute top-1 right-1 w-2 h-2 rounded-full',
              statusColors[day.post.status]
            )}
            title={`${day.post.songName} - ${day.post.status}`}
          />
        )}

        {/* Status icon for posts */}
        {day.post && StatusIcon && (
          <div className="absolute bottom-1 right-1">
            <StatusIcon className="w-3 h-3 text-purple-300" />
          </div>
        )}
      </div>
    </button>
  );
}

// Helper to create calendar day object with primitive comparisons
function createCalendarDaySimple(
  date: Date,
  campaignStart: Date,
  posts: ScheduledPost[],
  todayTime: number,
  selectedDateStr: string
): CalendarDay {
  const dateStr = date.toISOString().split('T')[0];
  const post = posts.find(p => p.scheduledDate.startsWith(dateStr ?? ''));
  
  // Calculate day number (1-365)
  const diffTime = date.getTime() - campaignStart.getTime();
  const dayNumber = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  // Normalize date for comparison
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  const dateTime = normalizedDate.getTime();
  
  const currentDateStr = getDateString(date);

  return {
    date,
    dayNumber,
    post,
    isToday: dateTime === todayTime,
    isPast: dateTime < todayTime,
    isSelected: currentDateStr === selectedDateStr,
  };
}

export default Calendar;
