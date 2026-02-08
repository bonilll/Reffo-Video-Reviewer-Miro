"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";

import { api } from "@/convex/_generated/api";
import { CalendarHeader } from "@/app/dashboard-app/calendar/_components/calendar-header";
import { DayView } from "@/app/dashboard-app/calendar/_components/day-view";
import { WeekViewNew } from "@/app/dashboard-app/calendar/_components/week-view-new";
import { MonthViewNew } from "@/app/dashboard-app/calendar/_components/month-view-new";
import { ListView } from "@/app/dashboard-app/calendar/_components/list-view";
import { EventDialogNew } from "@/app/dashboard-app/calendar/_components/event-dialog-new";
import { CalendarSettingsDialog } from "@/app/dashboard-app/calendar/_components/calendar-settings-dialog";
import { expandRecurringEvents } from "@/app/dashboard-app/calendar/_lib/recurrence";

interface CalendarFullscreenDialogProps {
  onClose: () => void;
}

type ViewType = "day" | "week" | "month" | "list";

export const CalendarFullscreenDialog = ({ onClose }: CalendarFullscreenDialogProps) => {
  // ================== STATE ==================
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewType, setViewType] = useState<ViewType>("week");
  const [selectedCalendars, setSelectedCalendars] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);
  const [newEventHour, setNewEventHour] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [colorMode, setColorMode] = useState<'calendar' | 'label'>('calendar');

  // ================== QUERIES ==================
  const calendarsResult = useQuery(api.calendar.getMyCalendars, {
    includeArchived: false
  });
  const calendars = calendarsResult || { owned: [], shared: [] };
  const labels = useQuery(api.calendar.getLabels, {}) || [];
  const isLoadingCalendars = calendarsResult === undefined;
  
  // All calendars combined
  const allCalendars = useMemo(() => {
    return [...(calendars.owned || []), ...(calendars.shared || [])];
  }, [calendars]);

  // Build date range for events
  const eventStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const eventEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0);
  
  // Get events
  const rawEvents = useQuery(
    api.calendar.getEvents,
    selectedCalendars.length > 0 ? {
      calendarIds: selectedCalendars as any,
      startDate: eventStartDate.toISOString(),
      endDate: eventEndDate.toISOString(),
    } : "skip"
  ) || [];
  
  // ================== MUTATIONS ==================
  const createDefaultCalendar = useMutation(api.calendar.createDefaultCalendar);
  const initializeLabels = useMutation(api.calendar.initializeCalendarLabels);
  const updateEvent = useMutation(api.calendar.updateEvent);

  // ================== MEMOS ==================
  // Process recurring events
  const events = useMemo(() => {
    return expandRecurringEvents(rawEvents, eventStartDate, eventEndDate);
  }, [rawEvents, eventStartDate, eventEndDate]);

  // ================== EFFECTS ==================
  // Initialize calendars and labels
  useEffect(() => {
    const initializeCalendars = async () => {
      if (isInitialized || isLoadingCalendars) return;
      
        try {
        if (allCalendars.length === 0) {
            // Create default calendar
            const defaultCalendarId = await createDefaultCalendar({});
            
          // Initialize default labels
            await initializeLabels({});
            
            if (defaultCalendarId) {
              setSelectedCalendars([defaultCalendarId]);
            }
        } else {
          // Select all calendars by default
          const calendarIds = allCalendars.map(c => c._id);
          setSelectedCalendars(calendarIds);
          }
          
          setIsInitialized(true);
        } catch (error) {
          console.error("Error initializing calendars:", error);
        toast.error("Error initializing calendar");
      }
    };
    
    initializeCalendars();
  }, [isLoadingCalendars, allCalendars, isInitialized, createDefaultCalendar, initializeLabels]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle if no input is focused
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key) {
        case '1':
          setViewType('day');
          break;
        case '2':
          setViewType('week');
          break;
        case '3':
          setViewType('month');
          break;
        case '4':
          setViewType('list');
          break;
        case 'Escape':
          if (showEventDialog || showSettingsDialog) {
            setShowEventDialog(false);
            setShowSettingsDialog(false);
          } else {
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showEventDialog, showSettingsDialog, onClose]);

  // ================== HANDLERS ==================
  const handleTodayClick = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleCalendarToggle = useCallback((calendarId: string) => {
    setSelectedCalendars(prev => 
      prev.includes(calendarId) 
        ? prev.filter(id => id !== calendarId)
        : [...prev, calendarId]
    );
  }, []);

  const handleLabelToggle = useCallback((labelId: string) => {
    setSelectedLabels(prev => 
      prev.includes(labelId) 
        ? prev.filter(id => id !== labelId)
        : [...prev, labelId]
    );
  }, []);
  
  const handleCreateEvent = useCallback(() => {
    let startTime = new Date();
    let endTime = new Date();
    
    if (newEventDate) {
      startTime = new Date(newEventDate);
      endTime = new Date(newEventDate);
      
      if (newEventHour !== null) {
        startTime.setHours(newEventHour, 0, 0, 0);
        endTime.setHours(newEventHour + 1, 0, 0, 0);
      } else {
        startTime.setHours(9, 0, 0, 0);
        endTime.setHours(10, 0, 0, 0);
      }
    } else {
      // Default to current time + 1 hour
      endTime.setHours(startTime.getHours() + 1);
    }
      
      setSelectedEvent({
      title: "",
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
        allDay: false,
      calendarId: selectedCalendars.length > 0 ? selectedCalendars[0] : "",
      });
    
    setShowEventDialog(true);
  }, [newEventDate, newEventHour, selectedCalendars]);
  
  const handleEventClick = useCallback((event: any) => {
    setSelectedEvent(event);
    setShowEventDialog(true);
  }, []);

  const handleTimeSlotClick = useCallback((date: Date, hour: number) => {
    setNewEventDate(date);
    setNewEventHour(hour);
    handleCreateEvent();
  }, [handleCreateEvent]);

  const handleDayClick = useCallback((date: Date) => {
    if (viewType === 'month') {
      // Switch to day view for the selected date
      setCurrentDate(date);
      setViewType('day');
      } else {
      // Create new event for this day
      setNewEventDate(date);
      setNewEventHour(null);
      handleCreateEvent();
    }
  }, [viewType, handleCreateEvent]);

  const handleEventDrop = useCallback(async (event: any, newStartTime: string) => {
    try {
      const oldStart = new Date(event.startTime);
      const oldEnd = new Date(event.endTime);
      const newStart = new Date(newStartTime);
      
      // Calculate duration and preserve it
      const duration = oldEnd.getTime() - oldStart.getTime();
      const newEnd = new Date(newStart.getTime() + duration);
      
      await updateEvent({
        id: event._id,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
      });
      
      toast.success("Event moved successfully");
    } catch (error) {
      console.error("Error moving event:", error);
      toast.error("Failed to move event");
    }
  }, [updateEvent]);

  const handleEventDialogClose = useCallback(() => {
    setShowEventDialog(false);
    setSelectedEvent(null);
    setNewEventDate(null);
    setNewEventHour(null);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setShowSettingsDialog(true);
  }, []);

  const handleSettingsClose = useCallback(() => {
    setShowSettingsDialog(false);
  }, []);

  const handleColorModeToggle = useCallback(() => {
    setColorMode(prev => prev === 'calendar' ? 'label' : 'calendar');
  }, []);

  // ================== RENDER ==================
  if (isLoadingCalendars) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <Loader size="lg" />
          <p className="mt-4 text-gray-500">Loading calendar...</p>
        </div>
      </div>
    );
  }
  
  const renderCalendarView = () => {
    const commonProps = {
      events,
      onEventClick: handleEventClick,
      colorMode,
    };

    switch (viewType) {
      case 'day':
        return (
          <DayView
            date={currentDate}
            onTimeSlotClick={handleTimeSlotClick}
            onEventDrop={handleEventDrop}
            {...commonProps}
          />
        );
      
      case 'week':
        return (
          <WeekViewNew
            date={currentDate}
            onTimeSlotClick={handleTimeSlotClick}
            onEventDrop={handleEventDrop}
            {...commonProps}
          />
        );
      
      case 'month':
        return (
          <MonthViewNew
            date={currentDate}
            onDayClick={handleDayClick}
            {...commonProps}
          />
        );
      
      case 'list':
    return (
          <ListView
            date={currentDate}
            {...commonProps}
          />
        );
      
      default:
        return null;
    }
  };
  
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Custom Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
          <h1 className="text-xl font-bold">Calendar</h1>
        </div>
        
      {/* Calendar Header */}
      <CalendarHeader
        currentDate={currentDate}
        viewType={viewType}
            selectedCalendars={selectedCalendars}
            selectedLabels={selectedLabels}
        calendars={allCalendars}
            labels={labels}
        events={events}
        colorMode={colorMode}
        onDateChange={setCurrentDate}
        onViewChange={setViewType}
            onCalendarToggle={handleCalendarToggle}
            onLabelToggle={handleLabelToggle}
        onCreateEvent={handleCreateEvent}
        onTodayClick={handleTodayClick}
        onOpenSettings={handleOpenSettings}
        onColorModeToggle={handleColorModeToggle}
      />

      {/* Main calendar view */}
      <div className="flex-1 overflow-hidden bg-white">
        {renderCalendarView()}
      </div>
      
      {/* Event Dialog */}
      {showEventDialog && (
        <EventDialogNew
        event={selectedEvent}
        calendars={allCalendars}
        labels={labels}
          onClose={handleEventDialogClose}
        />
      )}

      {/* Settings Dialog */}
      {showSettingsDialog && (
        <CalendarSettingsDialog
          calendars={allCalendars}
          labels={labels}
          onClose={handleSettingsClose}
        />
      )}
    </div>
  );
}; 