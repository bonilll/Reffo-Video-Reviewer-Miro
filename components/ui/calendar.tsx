"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface CalendarProps {
  className?: string;
  selected?: Date;
  onSelect?: (date: Date) => void;
  disabled?: (date: Date) => boolean;
  initialFocus?: boolean;
  month?: Date;
  onMonthChange?: (date: Date) => void;
  mode?: "single" | "range" | "multiple";
}

function Calendar({
  className,
  selected,
  onSelect,
  disabled,
  month = new Date(),
  onMonthChange,
  mode = "single",
}: CalendarProps) {
  // Usa ref per tracciare se il mese è stato inizializzato dall'utente
  const userNavigatedRef = React.useRef(false);
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    // Inizializza sempre al mese corrente, mai alla data selezionata
    return month || new Date();
  });
  const [hoveredDay, setHoveredDay] = React.useState<Date | null>(null);
  
  // Inizializza al mese della data selezionata solo una volta, poi lascia navigare l'utente
  const hasInitializedRef = React.useRef(false);
  React.useEffect(() => {
    if (selected && !hasInitializedRef.current && !userNavigatedRef.current) {
      const selectedMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
      if (format(selectedMonth, 'yyyy-MM') !== format(currentMonth, 'yyyy-MM')) {
        setCurrentMonth(selectedMonth);
        hasInitializedRef.current = true;
      }
    }
  }, [selected, currentMonth]); // Dipende da selected e currentMonth
  
  // Aggiorna il mese corrente solo quando cambia la prop month esterna
  React.useEffect(() => {
    if (month && format(month, 'yyyy-MM') !== format(currentMonth, 'yyyy-MM')) {
      setCurrentMonth(month);
      userNavigatedRef.current = false; // Reset del flag quando arriva un mese dall'esterno
    }
  }, [month]);
  
  // Giorni della settimana in italiano
  const daysOfWeek = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  
  // Funzione per ottenere i giorni del mese corrente
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const numDays = new Date(year, month + 1, 0).getDate();
    
    // Ottieni il giorno della settimana del primo giorno del mese (0 = Domenica)
    let firstDayOfMonth = new Date(year, month, 1).getDay();
    // Converti da 0-based (domenica = 0) a 1-based (lunedì = 0)
    firstDayOfMonth = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    
    // Array per contenere tutti i giorni da visualizzare
    const days = [];
    
    // Aggiungi spazi vuoti per i giorni precedenti al primo del mese
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // Aggiungi i giorni del mese
    for (let i = 1; i <= numDays; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };
  
  // Ottieni i giorni da visualizzare
  const daysToDisplay = getDaysInMonth(currentMonth);
  
  // Gestisci il cambio di mese
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const prevMonth = subMonths(currentMonth, 1);
    setCurrentMonth(prevMonth);
    userNavigatedRef.current = true; // Segna che l'utente ha navigato manualmente
    onMonthChange?.(prevMonth);
  };
  
  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextMonth = addMonths(currentMonth, 1);
    setCurrentMonth(nextMonth);
    userNavigatedRef.current = true; // Segna che l'utente ha navigato manualmente
    onMonthChange?.(nextMonth);
  };
  
  // Funzione per controllare se una data è selezionata
  const isSelected = (date: Date) => {
    if (!selected || !date) return false;
    return format(selected, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
  };
  
  // Funzione per controllare se una data è oggi
  const isToday = (date: Date) => {
    if (!date) return false;
    const today = new Date();
    return format(today, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
  };
  
  // Funzione per controllare se una data è disabilitata
  const isDisabledDate = (date: Date) => {
    if (!date) return true;
    return disabled ? disabled(date) : false;
  };
  
  // Gestisci la selezione di una data
  const handleSelectDate = (date: Date, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!date || isDisabledDate(date)) return;
    onSelect?.(date);
  };
  
  // Formatta il nome del mese con prima lettera maiuscola
  const formatMonth = (date: Date) => {
    const monthName = format(date, "MMMM", { locale: it });
    return monthName.charAt(0).toUpperCase() + monthName.slice(1) + " " + format(date, "yyyy");
  };
  
  return (
    <div 
      className={cn("p-3 select-none", className)}
      data-calendar="true"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Intestazione con mese e anno e controlli di navigazione */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">
          {formatMonth(currentMonth)}
        </h2>
        <div className="flex space-x-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevMonth}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-7 w-7"
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextMonth}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-7 w-7"
            type="button"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Intestazione giorni della settimana */}
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
      
      {/* Griglia dei giorni */}
      <div className="grid grid-cols-7 gap-1">
        {daysToDisplay.map((date, index) => {
          const isDisabled = date ? isDisabledDate(date) : true;
          const isSelectedDate = date ? isSelected(date) : false;
          const isTodayDate = date ? isToday(date) : false;
          const isHovered = date && hoveredDay ? 
            format(date, "yyyy-MM-dd") === format(hoveredDay, "yyyy-MM-dd") : false;
          
          return (
            <div
              key={index}
              className={cn(
                "h-9 w-9 text-center flex items-center justify-center rounded-md transition-colors",
                "text-sm font-medium",
                !date && "invisible",
                date && isSelectedDate && "bg-primary text-primary-foreground",
                date && isTodayDate && !isSelectedDate && "border border-primary text-primary",
                date && !isSelectedDate && !isTodayDate && !isDisabled && "hover:bg-accent hover:text-accent-foreground",
                date && isDisabled && "text-muted-foreground opacity-50 cursor-not-allowed",
                date && !isDisabled && "cursor-pointer",
                date && isHovered && !isSelectedDate && !isDisabled && "bg-accent/50"
              )}
              onClick={(e) => date && handleSelectDate(date, e)}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => date && !isDisabled && setHoveredDay(date)}
              onMouseLeave={() => setHoveredDay(null)}
              role={date && !isDisabled ? "button" : undefined}
              tabIndex={date && !isDisabled ? 0 : undefined}
              aria-label={date ? format(date, "d MMMM yyyy", { locale: it }) : undefined}
              aria-selected={isSelectedDate}
              aria-disabled={isDisabled}
            >
              {date ? date.getDate() : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

Calendar.displayName = "Calendar";

export { Calendar }; 