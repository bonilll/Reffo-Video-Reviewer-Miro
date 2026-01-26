"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface StandaloneCalendarProps {
  className?: string;
  selected?: Date;
  onSelect?: (date: Date) => void;
  disabled?: (date: Date) => boolean;
}

export function StandaloneCalendar({
  className,
  selected,
  onSelect,
  disabled,
}: StandaloneCalendarProps) {
  // Simple month state - starts with current month or selected month, no automatic resets
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    if (selected) {
      return new Date(selected.getFullYear(), selected.getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  // Days of week in Italian
  const daysOfWeek = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  
  // Get days to display for current month
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const numDays = new Date(year, month + 1, 0).getDate();
    
    // Get first day of month (0 = Sunday)
    let firstDayOfMonth = new Date(year, month, 1).getDay();
    // Convert to Monday = 0
    firstDayOfMonth = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    
    const days = [];
    
    // Add empty cells for previous month days
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // Add days of current month
    for (let i = 1; i <= numDays; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };
  
  const daysToDisplay = getDaysInMonth(currentMonth);
  
  // Handle previous month
  const handlePrevMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1));
  };
  
  // Handle next month
  const handleNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1));
  };
  
  // Check if date is selected
  const isSelected = (date: Date) => {
    if (!selected || !date) return false;
    return format(selected, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
  };
  
  // Check if date is today
  const isToday = (date: Date) => {
    if (!date) return false;
    const today = new Date();
    return format(today, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
  };
  
  // Check if date is disabled
  const isDisabledDate = (date: Date) => {
    if (!date) return true;
    return disabled ? disabled(date) : false;
  };
  
  // Handle date selection
  const handleSelectDate = (date: Date) => {
    if (!date || isDisabledDate(date)) return;
    onSelect?.(date);
  };
  
  // Format month name
  const formatMonth = (date: Date) => {
    const monthName = format(date, "MMMM", { locale: it });
    return monthName.charAt(0).toUpperCase() + monthName.slice(1) + " " + format(date, "yyyy");
  };
  
  return (
    <div className={cn("p-3 select-none", className)} data-calendar="true">
      {/* Header with navigation */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">
          {formatMonth(currentMonth)}
        </h2>
        <div className="flex space-x-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevMonth}
            className="h-7 w-7"
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextMonth}
            className="h-7 w-7"
            type="button"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Days of week header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {daysOfWeek.map((day) => (
          <div 
            key={day} 
            className="text-center text-sm font-medium text-muted-foreground py-1"
          >
            {day}
          </div>
        ))}
      </div>
      
      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {daysToDisplay.map((date, index) => {
          const isDisabled = date ? isDisabledDate(date) : true;
          const isSelectedDate = date ? isSelected(date) : false;
          const isTodayDate = date ? isToday(date) : false;
          
          return (
            <div
              key={index}
              className={cn(
                "h-9 w-9 text-center flex items-center justify-center rounded-md transition-colors",
                "text-sm font-medium cursor-pointer",
                !date && "invisible",
                date && isSelectedDate && "bg-primary text-primary-foreground",
                date && isTodayDate && !isSelectedDate && "border border-primary text-primary",
                date && !isSelectedDate && !isTodayDate && !isDisabled && "hover:bg-accent hover:text-accent-foreground",
                date && isDisabled && "text-muted-foreground opacity-50 cursor-not-allowed"
              )}
              onClick={() => date && handleSelectDate(date)}
            >
              {date ? date.getDate() : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}