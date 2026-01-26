"use client";

import { memo, useState, useRef, useEffect, useCallback } from "react";
import { nanoid } from "nanoid";
import { useMutation } from "@/liveblocks.config";
import { TableLayer, TableColumnType, TableSelectOption, TableColumn, TableRow, TableCell } from "@/types/canvas";
import { colorToCSS } from "@/lib/utils";
import { toast } from "sonner";
import { 
  Calendar, 
  Image as ImageIcon, 
  Hash,
  Type,
  ChevronDown,
  Plus,
  Trash2,
  Settings,
  MoreHorizontal,
  GripVertical,
  CheckSquare,
  Square,
  List,
  X
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TableProps {
  id: string;
  layer: TableLayer;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  selectionColor?: string;
  isSelected?: boolean;
}

// Mutazione per aggiornare la tabella
const useUpdateTable = () => {
  return useMutation(({ storage }, layerId: string, updates: Partial<TableLayer>) => {
    const liveLayers = storage.get("layers");
    const layer = liveLayers.get(layerId);
    
    if (!layer) return;
    
    // Aggiorna le proprietà della tabella
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        (layer as any).set(key, value);
      }
    });
  }, []);
};

// Hook per calcolare la larghezza ottimale del contenuto
const useAutoResize = () => {
  const measureText = useCallback((text: string, fontSize: number = 14, fontWeight: string = "normal") => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 100;
    
    context.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, sans-serif`;
    return Math.ceil(context.measureText(text).width);
  }, []);

  const calculateOptimalColumnWidth = useCallback((column: TableColumn, rows: TableRow[]) => {
    // Calcola larghezza minima per il titolo della colonna
    // Struttura header: [padding-left] [icona] [gap] [titolo] [gap] [settings-btn] [gap] [menu-btn] [padding-right]
    const headerTextWidth = measureText(column.name, 14, "600");
    const headerPadding = 32; // px-4 = 16px left + 16px right
    const typeIconWidth = 16; // h-4 w-4
    const gapBetweenElements = 12; // gap-3
    const settingsButtonWidth = 24; // h-6 w-6
    const menuButtonWidth = 24; // h-6 w-6
    const gapBetweenButtons = 4; // gap-1
    const gapBeforeButtons = 12; // gap-3 tra sezioni
    
    // Calcolo completo: padding + icona + gap + titolo + gap + bottone1 + gap + bottone2 + padding
    const minHeaderWidth = headerPadding + typeIconWidth + gapBetweenElements + headerTextWidth + 
                          gapBeforeButtons + settingsButtonWidth + gapBetweenButtons + menuButtonWidth;
    
    let maxContentWidth = minHeaderWidth;
    
    // Analizza ogni riga per trovare la larghezza massima necessaria
    rows.forEach(row => {
      const cell = row.cells.find(c => c.columnId === column.id);
      if (!cell?.value) return;
      
      let cellContentWidth = 0;
      const cellPadding = 32; // px-4 = 16px left + 16px right (stesso dell'header)
      
      switch (column.type) {
        case TableColumnType.Text:
          cellContentWidth = measureText(String(cell.value), 14) + cellPadding;
          break;
          
        case TableColumnType.Number:
          // Numeri con font monospace, più spazio per allineamento
          cellContentWidth = measureText(String(cell.value), 14, "normal") + cellPadding + 8;
          break;
          
        case TableColumnType.Date:
          if (cell.value) {
            // Formato data italiana + icona calendario
            const dateText = new Date(cell.value).toLocaleDateString('it-IT');
            cellContentWidth = measureText(dateText, 14) + 24 + cellPadding; // +24 per icona + gap
          } else {
            cellContentWidth = measureText("Select date", 14) + 24 + cellPadding;
          }
          break;
          
        case TableColumnType.Select:
          if (cell.value && column.options) {
            const option = column.options.find(opt => opt.id === cell.value);
            if (option) {
              // Badge con padding interno + bordo
              const badgeTextWidth = measureText(option.label, 12);
              const badgePadding = 16; // Padding interno badge
              const badgeBorder = 2; // Bordo badge
              cellContentWidth = badgeTextWidth + badgePadding + badgeBorder + cellPadding;
            }
          } else {
            cellContentWidth = measureText("Seleziona opzione", 14) + cellPadding;
          }
          break;
          
        case TableColumnType.MultiSelect:
          if (Array.isArray(cell.value) && cell.value.length > 0 && column.options) {
            let totalBadgeWidth = 0;
            let badgeCount = 0;
            
            cell.value.forEach(optionId => {
              const option = column.options!.find(opt => opt.id === optionId);
              if (option) {
                const badgeTextWidth = measureText(option.label, 12);
                const badgePadding = 16;
                const badgeBorder = 2;
                totalBadgeWidth += badgeTextWidth + badgePadding + badgeBorder;
                badgeCount++;
              }
            });
            
            // Aggiungi spazio per gap tra badge (4px tra badge)
            const gapWidth = Math.max(0, (badgeCount - 1) * 4);
            cellContentWidth = totalBadgeWidth + gapWidth + cellPadding;
            
            // Se ci sono troppi badge, considera il wrapping
            if (badgeCount > 3) {
              // Stima larghezza media per badge e calcola layout ottimale
              const avgBadgeWidth = totalBadgeWidth / badgeCount;
              const optimalRowWidth = avgBadgeWidth * 3 + (2 * 4); // 3 badge per riga
              cellContentWidth = Math.max(cellContentWidth, optimalRowWidth + cellPadding);
            }
          } else {
            cellContentWidth = measureText("Seleziona opzioni", 14) + cellPadding;
          }
          break;
          
        case TableColumnType.Image:
          // Larghezza fissa per immagini con testo descrittivo
          cellContentWidth = 120 + cellPadding;
          break;
          
        default:
          cellContentWidth = measureText(String(cell.value), 14) + cellPadding;
      }
      
      maxContentWidth = Math.max(maxContentWidth, cellContentWidth);
    });
    
    // Assicurati che la larghezza non sia mai inferiore al minimo necessario
    // Il minimo assoluto è quello dell'header, ma mai meno di 150px per usabilità
    const absoluteMinWidth = Math.max(minHeaderWidth, 150);
    const maxWidth = 600; // Aumentato ulteriormente il limite massimo
    
    const finalWidth = Math.min(Math.max(maxContentWidth, absoluteMinWidth), maxWidth);
    
    return finalWidth;
  }, [measureText]);

  return { calculateOptimalColumnWidth };
};

// Componente per editing di una cella
const EditableCell = ({ 
  cell, 
  column, 
  onUpdate 
}: { 
  cell: TableCell; 
  column: TableColumn;
  onUpdate: (value: any) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(cell.value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    onUpdate(editValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(cell.value || "");
      setIsEditing(false);
    }
  };

  if (isEditing) {
    switch (column.type) {
      case TableColumnType.Text:
      case TableColumnType.Number:
        return (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-8 text-sm border-0 shadow-none bg-transparent p-2 focus-visible:ring-1 focus-visible:ring-blue-500"
            type={column.type === TableColumnType.Number ? "number" : "text"}
          />
        );
      
      case TableColumnType.Date:
        return (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-8 text-sm border-0 shadow-none bg-transparent p-2 focus-visible:ring-1 focus-visible:ring-blue-500"
            type="date"
          />
        );
      
      default:
        return (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-8 text-sm border-0 shadow-none bg-transparent p-2 focus-visible:ring-1 focus-visible:ring-blue-500"
          />
        );
    }
  }

  // Rendering normale con click per editare
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (column.type !== TableColumnType.Select && column.type !== TableColumnType.MultiSelect) {
      setIsEditing(true);
      setEditValue(cell.value || "");
    }
  };

  return (
    <div 
      onClick={handleClick} 
      className="w-full h-full flex items-center cursor-pointer hover:bg-gray-50/50 rounded-sm transition-colors"
    >
      <TableCellContent cell={cell} column={column} onUpdate={onUpdate} />
    </div>
  );
};

// Componente per renderizzare il contenuto di una cella
const TableCellContent = ({ 
  cell, 
  column,
  onUpdate 
}: { 
  cell: TableCell; 
  column: TableColumn;
  onUpdate?: (value: any) => void;
}) => {
  const value = cell.value;

  switch (column.type) {
    case TableColumnType.Text:
      return (
        <span className="text-sm text-gray-900 break-words leading-relaxed">
          {value || <span className="text-gray-400 italic">Enter text...</span>}
        </span>
      );
    
    case TableColumnType.Number:
      return (
        <span className="text-sm text-gray-900 font-mono tabular-nums">
          {value || <span className="text-gray-400 italic">0</span>}
        </span>
      );
    
    case TableColumnType.Date:
      return (
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-900 whitespace-nowrap">
            {value ? new Date(value).toLocaleDateString('it-IT') : 
             <span className="text-gray-400 italic">Select date</span>}
          </span>
        </div>
      );
    
    case TableColumnType.Image:
      return (
        <div className="flex items-center justify-center w-full h-full relative group">
          {value ? (
            <div className="relative flex items-center justify-center w-full h-full">
              {/* Determina se è un'immagine o un video dal tipo di file */}
              {value.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img 
                  src={value} 
                  alt="Immagine cella" 
                  className="max-w-full max-h-full object-contain rounded shadow-sm"
                  style={{ maxHeight: '80px', maxWidth: '120px' }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : value.match(/\.(mp4|webm|ogg|mov)$/i) ? (
                <video 
                  src={value} 
                  className="max-w-full max-h-full object-contain rounded shadow-sm"
                  style={{ maxHeight: '80px', maxWidth: '120px' }}
                  muted
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-16 h-16 bg-gray-100 border rounded flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-gray-400" />
                </div>
              )}
              
              {/* Cestino all'hover */}
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-full shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate?.("");
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center text-gray-400 w-full h-full py-4">
              <div className="flex flex-col items-center gap-1">
                <ImageIcon className="h-8 w-8 text-gray-300" />
              </div>
            </div>
          )}
        </div>
      );
    
    case TableColumnType.Select:
      return (
        <div className="w-full" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full h-8 justify-start p-2 hover:bg-gray-100 border-0 shadow-none"
              >
                {value && column.options ? (() => {
                  const option = column.options.find(opt => opt.id === value);
                  return option ? (
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium border"
                      style={{
                        backgroundColor: colorToCSS(option.color) + "15",
                        color: colorToCSS(option.color),
                        borderColor: colorToCSS(option.color) + "40"
                      }}
                    >
                      {option.label}
                    </Badge>
                  ) : (
                    <span className="text-gray-400 italic">Opzione non trovata</span>
                  );
                })() : (
                  <span className="text-gray-400 italic">Seleziona opzione...</span>
                )}
                <ChevronDown className="h-3 w-3 ml-auto text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="start" 
              className="table-dropdown-content min-w-[200px] max-h-[200px] overflow-y-auto"
              sideOffset={4}
            >
              {column.options?.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onUpdate?.(option.id);
                  }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Badge
                    variant="secondary"
                    className="text-xs font-medium border"
                    style={{
                      backgroundColor: colorToCSS(option.color) + "15",
                      color: colorToCSS(option.color),
                      borderColor: colorToCSS(option.color) + "40"
                    }}
                  >
                    {option.label}
                  </Badge>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUpdate?.("");
                }}
                className="text-gray-500"
              >
                <Square className="h-3 w-3 mr-2" />
                Cancella selezione
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    
    case TableColumnType.MultiSelect:
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <div className="w-full" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full h-auto min-h-[32px] justify-start p-2 hover:bg-gray-100 border-0 shadow-none"
              >
                <div className="flex flex-wrap gap-1 w-full">
                  {selectedValues.length > 0 && column.options ? (
                    <>
                      {selectedValues.slice(0, 3).map((optionId: string) => {
                        const option = column.options!.find(opt => opt.id === optionId);
                        return option ? (
                          <Badge
                            key={optionId}
                            variant="secondary"
                            className="text-xs font-medium border flex-shrink-0"
                            style={{
                              backgroundColor: colorToCSS(option.color) + "15",
                              color: colorToCSS(option.color),
                              borderColor: colorToCSS(option.color) + "40"
                            }}
                          >
                            {option.label}
                          </Badge>
                        ) : null;
                      })}
                      {selectedValues.length > 3 && (
                        <Badge variant="outline" className="text-xs text-gray-500 flex-shrink-0">
                          +{selectedValues.length - 3}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400 italic">Seleziona opzioni...</span>
                  )}
                </div>
                <ChevronDown className="h-3 w-3 ml-auto text-gray-400 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="start" 
              className="table-dropdown-content min-w-[200px] max-h-[250px] overflow-y-auto"
              sideOffset={4}
            >
              {column.options?.map((option) => {
                const isSelected = selectedValues.includes(option.id);
                return (
                  <DropdownMenuItem
                    key={option.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newValues = isSelected 
                        ? selectedValues.filter(v => v !== option.id)
                        : [...selectedValues, option.id];
                      onUpdate?.(newValues);
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <div 
                      className={`w-4 h-4 border rounded flex items-center justify-center ${
                        isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <CheckSquare className="h-3 w-3 text-white" />}
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium border"
                      style={{
                        backgroundColor: colorToCSS(option.color) + "15",
                        color: colorToCSS(option.color),
                        borderColor: colorToCSS(option.color) + "40"
                      }}
                    >
                      {option.label}
                    </Badge>
                  </DropdownMenuItem>
                );
              })}
              {selectedValues.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onUpdate?.([]);
                    }}
                    className="text-gray-500"
                  >
                    <Square className="h-3 w-3 mr-2" />
                    Cancella tutto
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    
    default:
      return (
        <span className="text-sm text-gray-900 truncate">
          {value || <span className="text-gray-400 italic">Vuoto</span>}
        </span>
      );
  }
};

// Icona per il tipo di colonna
const getColumnTypeIcon = (type: TableColumnType) => {
  switch (type) {
    case TableColumnType.Text:
      return Type;
    case TableColumnType.Number:
      return Hash;
    case TableColumnType.Date:
      return Calendar;
    case TableColumnType.Select:
    case TableColumnType.MultiSelect:
      return ChevronDown;
    case TableColumnType.Image:
      return ImageIcon;
    default:
      return Type;
  }
};

// Nomi user-friendly per i tipi di colonna
const getColumnTypeName = (type: TableColumnType) => {
  switch (type) {
    case TableColumnType.Text:
      return "Testo";
    case TableColumnType.Number:
      return "Numero";
    case TableColumnType.Date:
      return "Data";
    case TableColumnType.Select:
      return "Selezione singola";
    case TableColumnType.MultiSelect:
      return "Selezione multipla";
    case TableColumnType.Image:
      return "Immagine";
    default:
      return "Testo";
  }
};

// Componente per editing inline di titoli
const EditableTitle = ({ 
  value, 
  onSave, 
  className = "",
  placeholder = "Enter title..."
}: { 
  value: string; 
  onSave: (newValue: string) => void;
  className?: string;
  placeholder?: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editValue.trim() !== value) {
      onSave(editValue.trim() || placeholder);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`h-auto border-0 shadow-none bg-transparent p-0 focus-visible:ring-1 focus-visible:ring-blue-500 ${className}`}
      />
    );
  }

  return (
    <span 
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
        setEditValue(value);
      }}
      className={`cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 transition-colors ${className}`}
      title="Clicca per modificare"
    >
      {value || placeholder}
    </span>
  );
};

// Componente per le impostazioni delle colonne
const ColumnSettingsDialog = ({ 
  column, 
  isOpen, 
  onClose, 
  onSave 
}: { 
  column: TableColumn; 
  isOpen: boolean; 
  onClose: () => void;
  onSave: (updatedColumn: TableColumn) => void;
}) => {
  const [localColumn, setLocalColumn] = useState<TableColumn>(column);
  const [newOptionLabel, setNewOptionLabel] = useState("");

  useEffect(() => {
    setLocalColumn(column);
  }, [column]);

  const addOption = () => {
    if (!newOptionLabel.trim()) return;
    
    const newOption: TableSelectOption = {
      id: `option_${nanoid()}`,
      label: newOptionLabel.trim(),
      color: { r: 59, g: 130, b: 246 } // Default blue
    };
    
    setLocalColumn(prev => ({
      ...prev,
      options: [...(prev.options || []), newOption]
    }));
    setNewOptionLabel("");
  };

  const removeOption = (optionId: string) => {
    setLocalColumn(prev => ({
      ...prev,
      options: prev.options?.filter(opt => opt.id !== optionId) || []
    }));
  };

  const updateOption = (optionId: string, updates: Partial<TableSelectOption>) => {
    setLocalColumn(prev => ({
      ...prev,
      options: prev.options?.map(opt => 
        opt.id === optionId ? { ...opt, ...updates } : opt
      ) || []
    }));
  };

  const handleSave = () => {
    onSave(localColumn);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[300]" onClick={onClose}>
      <div 
        className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Column Settings</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Column Name</label>
            <Input
              value={localColumn.name}
              onChange={(e) => setLocalColumn(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Column name"
              className="w-full"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="required"
              checked={localColumn.required || false}
              onChange={(e) => setLocalColumn(prev => ({ ...prev, required: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <label htmlFor="required" className="text-sm font-medium text-gray-700">
              Required field
            </label>
          </div>

          {(localColumn.type === TableColumnType.Select || localColumn.type === TableColumnType.MultiSelect) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Options</label>
              <div className="space-y-3">
                {localColumn.options?.map((option) => (
                  <div key={option.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <input
                      type="color"
                      value={colorToCSS(option.color)}
                      onChange={(e) => {
                        const hex = e.target.value;
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        updateOption(option.id, { color: { r, g, b } });
                      }}
                      className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                    />
                    <Input
                      value={option.label}
                      onChange={(e) => updateOption(option.id, { label: e.target.value })}
                      className="flex-1"
                      placeholder="Option label"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeOption(option.id)}
                      className="px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-200 rounded-lg">
                  <div className="w-8 h-8 bg-blue-500 rounded border border-gray-300"></div>
                  <Input
                    value={newOptionLabel}
                    onChange={(e) => setNewOptionLabel(e.target.value)}
                    placeholder="New option..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addOption();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addOption}
                    disabled={!newOptionLabel.trim()}
                    className="px-2"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-200">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

// Hook per resize manuale migliorato
const useColumnResize = () => {
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizingColumnId(columnId);
    
    // Salva dati iniziali
    (window as any).resizeStartX = e.clientX;
    (window as any).resizeStartWidth = currentWidth;
    (window as any).currentX = e.clientX;
  }, []);

  const stopResize = useCallback(() => {
    setIsResizing(false);
    setResizingColumnId(null);
    
    // Pulisci anche le variabili globali
    delete (window as any).resizeStartX;
    delete (window as any).resizeStartWidth;
    delete (window as any).currentX;
  }, []);

  return { handleResizeStart, isResizing, resizingColumnId, stopResize };
};

// Hook per drag & drop delle colonne
const useColumnDragDrop = (columns: TableColumn[], updateTable: any, id: string) => {
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const handleColumnDragStart = useCallback((e: React.DragEvent, columnId: string) => {
    setDraggedColumnId(columnId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumnId(columnId);
  }, []);

  const handleColumnDragLeave = useCallback(() => {
    setDragOverColumnId(null);
  }, []);

  const handleColumnDrop = useCallback((e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    
    if (!draggedColumnId || draggedColumnId === targetColumnId) {
      setDraggedColumnId(null);
      setDragOverColumnId(null);
      return;
    }

    const draggedIndex = columns.findIndex(col => col.id === draggedColumnId);
    const targetIndex = columns.findIndex(col => col.id === targetColumnId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Riordina le colonne
    const newColumns = [...columns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumn);

    updateTable(id, { columns: newColumns });
    
    setDraggedColumnId(null);
    setDragOverColumnId(null);
  }, [draggedColumnId, columns, updateTable, id]);

  return {
    draggedColumnId,
    dragOverColumnId,
    handleColumnDragStart,
    handleColumnDragOver,
    handleColumnDragLeave,
    handleColumnDrop
  };
};

// Hook per gestire il drag & drop di layer dalla board
const useBoardElementDragDrop = (onElementDrop: (layerId: string, layerUrl: string, rowId: string, columnId: string) => void) => {
  const [draggedOver, setDraggedOver] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent, cellId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOver(cellId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Solo rimuovi l'highlight se stiamo uscendo dal container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDraggedOver(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, rowId: string, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOver(null);

    // Cerca dati del layer nella board
    const layerData = e.dataTransfer.getData('application/board-layer');
    if (layerData) {
      try {
        const layer = JSON.parse(layerData);
        if ((layer.type === 'image' || layer.type === 'video') && layer.url) {
          onElementDrop(layer.id, layer.url, rowId, columnId);
          return;
        }
      } catch (error) {
        console.error('Error parsing layer data:', error);
      }
    }

    // Fallback per file esterni (mantengo la compatibilità)
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        // Questo caso ora dovrebbe essere gestito diversamente o rimosso
        console.log('File drop detected, but board element drop is preferred');
      }
    }
  }, [onElementDrop]);

  return {
    draggedOver,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
};

export const Table = memo(({
  id,
  layer,
  onPointerDown,
  selectionColor,
  isSelected = false,
}: TableProps) => {
  const { x, y, width, height, fill, title, columns, rows, borderColor, headerColor, alternateRowColors } = layer;
  const updateTable = useUpdateTable();
  const { calculateOptimalColumnWidth } = useAutoResize();
  
  const [settingsColumn, setSettingsColumn] = useState<TableColumn | null>(null);

  // Hook per resize manuale
  const { handleResizeStart, isResizing, resizingColumnId, stopResize } = useColumnResize();

  // Hook per drag & drop delle colonne
  const { draggedColumnId, dragOverColumnId, handleColumnDragStart, handleColumnDragOver, handleColumnDragLeave, handleColumnDrop } = useColumnDragDrop(columns, updateTable, id);

  // Calcola altezza header e righe dinamicamente
  const headerHeight = 48;
  const baseRowHeight = 44;
  const titleHeight = title ? 40 : 0;

  // Calcola l'altezza dinamica delle righe basata sul contenuto
  const calculateRowHeight = useCallback((row: TableRow) => {
    let maxHeight = baseRowHeight;
    
    row.cells.forEach(cell => {
      const column = columns.find(col => col.id === cell.columnId);
      if (column?.type === TableColumnType.MultiSelect && Array.isArray(cell.value)) {
        const badgeCount = cell.value.length;
        if (badgeCount > 3) {
          maxHeight = Math.max(maxHeight, baseRowHeight + Math.ceil((badgeCount - 3) / 3) * 24);
        }
      }
    });
    
    return maxHeight;
  }, [columns, baseRowHeight]);

  // Auto-resize delle colonne - più reattivo e preciso
  useEffect(() => {
    const updatedColumns = columns.map(column => {
      const optimalWidth = calculateOptimalColumnWidth(column, rows);
      return { ...column, width: optimalWidth };
    });
    
    // Aggiorna sempre se ci sono differenze, anche piccole
    const hasChanges = updatedColumns.some((col, index) => 
      col.width !== columns[index].width
    );
    
    if (hasChanges) {
      updateTable(id, { columns: updatedColumns });
    }
  }, [columns, rows, calculateOptimalColumnWidth, updateTable, id]);

  // Forza ricalcolo immediato al primo render per correggere larghezze iniziali
  useEffect(() => {
    const hasNarrowColumns = columns.some(col => col.width < 150);
    if (hasNarrowColumns) {
      const correctedColumns = columns.map(column => {
        const optimalWidth = calculateOptimalColumnWidth(column, rows);
        return { ...column, width: optimalWidth };
      });
      updateTable(id, { columns: correctedColumns });
    }
  }, []); // Solo al primo render

  // Auto-resize immediato quando si aggiunge contenuto
  const updateCellWithResize = useCallback((rowId: string, columnId: string, value: any) => {
    const updatedRows = rows.map(row => {
      if (row.id === rowId) {
        const updatedCells = row.cells.map(cell => 
          cell.columnId === columnId ? { ...cell, value } : cell
        );
        
        // Se la cella non esiste, la creiamo
        if (!updatedCells.find(cell => cell.columnId === columnId)) {
          updatedCells.push({
            columnId,
            value
          });
        }
        
        return { 
          ...row, 
          cells: updatedCells,
          updatedAt: new Date().toISOString()
        };
      }
      return row;
    });

    // Aggiorna le righe
    updateTable(id, { rows: updatedRows });
    
    // Ricalcola immediatamente la larghezza della colonna interessata
    setTimeout(() => {
      const affectedColumn = columns.find(col => col.id === columnId);
      if (affectedColumn) {
        const optimalWidth = calculateOptimalColumnWidth(affectedColumn, updatedRows);
        if (optimalWidth !== affectedColumn.width) {
          const updatedColumns = columns.map(col => 
            col.id === columnId ? { ...col, width: optimalWidth } : col
          );
          updateTable(id, { columns: updatedColumns });
        }
      }
    }, 10); // Piccolo delay per permettere il render
  }, [rows, columns, calculateOptimalColumnWidth, updateTable, id]);

  // Gestione element drop dalla board
  const handleElementDrop = useCallback(async (layerId: string, layerUrl: string, rowId: string, columnId: string) => {
    // Usa direttamente l'URL del layer esistente
    updateCellWithResize(rowId, columnId, layerUrl);
    toast.success('Board element added to table');
  }, [updateCellWithResize]);

  // Hook per drag & drop
  const { draggedOver, handleDragOver, handleDragLeave, handleDrop } = useBoardElementDragDrop(handleElementDrop);

  // Listener per eventi personalizzati da layer della board
  useEffect(() => {
    const tableRef = document.querySelector(`[data-table-id="${id}"]`);
    
    const handleBoardElementDrop = (event: CustomEvent) => {
      const { layerData, rowId, columnId } = event.detail;
      if (layerData && layerData.url && rowId && columnId) {
        handleElementDrop(layerData.id, layerData.url, rowId, columnId);
      }
    };
    
    if (tableRef) {
      tableRef.addEventListener('boardElementDrop', handleBoardElementDrop as EventListener);
      
      return () => {
        tableRef.removeEventListener('boardElementDrop', handleBoardElementDrop as EventListener);
      };
    } else {
      // Riprova dopo un breve delay
      const timeout = setTimeout(() => {
        const retryTableRef = document.querySelector(`[data-table-id="${id}"]`);
        if (retryTableRef) {
          retryTableRef.addEventListener('boardElementDrop', handleBoardElementDrop as EventListener);
        }
      }, 100);
      
      return () => clearTimeout(timeout);
    }
  }, [id, handleElementDrop]);

  // Funzione per aggiungere una riga
  const addRow = () => {
    const now = new Date().toISOString();
    const newRow: TableRow = {
      id: `row_${nanoid()}`,
      cells: columns.map((column) => ({
        id: `cell_${nanoid()}`,
        columnId: column.id,
        value: column.type === TableColumnType.Number ? 0 :
               column.type === TableColumnType.Date ? "" :
               column.type === TableColumnType.Select ? "" :
               column.type === TableColumnType.MultiSelect ? [] :
               column.type === TableColumnType.Image ? "" :
               ""
      })),
      createdAt: now,
      updatedAt: now
    };
    
    updateTable(id, { rows: [...rows, newRow] });
    toast.success("Row added");
  };

  // Funzione per rimuovere una riga
  const removeRow = (rowId: string) => {
    if (rows.length <= 1) {
      toast.error("Cannot remove the last row");
      return;
    }

    const updatedRows = rows.filter(row => row.id !== rowId);
    updateTable(id, { rows: updatedRows });
    toast.success("Row removed");
  };

  // Funzione per aggiungere una colonna con tipo specifico
  const addColumn = (columnType: TableColumnType = TableColumnType.Text) => {
    const newColumn: TableColumn = {
      id: `col_${nanoid()}`,
      name: `Column ${columns.length + 1}`,
      type: columnType,
      width: 200, // Larghezza temporanea, verrà ricalcolata subito
      options: columnType === TableColumnType.Select || columnType === TableColumnType.MultiSelect ? [
        { id: `opt_${nanoid()}`, label: "Option 1", color: { r: 59, g: 130, b: 246 } },
        { id: `opt_${nanoid()}`, label: "Option 2", color: { r: 34, g: 197, b: 94 } }
      ] : undefined
    };
    
    // Calcola immediatamente la larghezza ottimale per la nuova colonna
    const optimalWidth = calculateOptimalColumnWidth(newColumn, rows);
    newColumn.width = optimalWidth;
    
    updateTable(id, { columns: [...columns, newColumn] });
    
    // Add cells for the new column to all existing rows
    const updatedRows = rows.map(row => ({
      ...row,
      cells: [...row.cells, {
        columnId: newColumn.id,
        value: columnType === TableColumnType.Number ? 0 :
               columnType === TableColumnType.Date ? "" :
               columnType === TableColumnType.Select ? "" :
               columnType === TableColumnType.MultiSelect ? [] :
               columnType === TableColumnType.Image ? "" :
               ""
      }]
    }));

    updateTable(id, { rows: updatedRows });
    toast.success(`${getColumnTypeName(columnType)} column added`);
  };

  // Funzione per aggiornare una colonna
  const updateColumn = (index: number, updatedColumn: TableColumn) => {
    const updatedColumns = columns.map((col, i) => 
      i === index ? updatedColumn : col
    );
    updateTable(id, { columns: updatedColumns });
  };

  // Funzione per rimuovere una colonna
  const removeColumn = (columnId: string) => {
    if (columns.length <= 1) {
      toast.error("Cannot remove the last column");
      return;
    }

    const updatedColumns = columns.filter(col => col.id !== columnId);
    const updatedRows = rows.map(row => ({
      ...row,
      cells: row.cells.filter(cell => cell.columnId !== columnId)
    }));

    updateTable(id, { 
      columns: updatedColumns,
      rows: updatedRows
    });
    toast.success("Column removed");
  };

  // Gestione resize end con aggiornamento della tabella
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing && resizingColumnId) {
        (window as any).currentX = e.clientX;
        
        // Calcola la nuova larghezza
        const deltaX = e.clientX - (window as any).resizeStartX;
        const currentColumn = columns.find(col => col.id === resizingColumnId);
        if (!currentColumn) return;
        
        // Calcola larghezza minima basata sul contenuto
        const minWidth = Math.max(120, getMinColumnWidth(currentColumn, rows));
        const newWidth = Math.max(minWidth, (window as any).resizeStartWidth + deltaX);
        
        // Aggiorna immediatamente la larghezza per feedback visivo
        const columnElements = document.querySelectorAll(`[data-column-id="${resizingColumnId}"]`);
        columnElements.forEach((element) => {
          (element as HTMLElement).style.width = `${newWidth}px`;
        });
        
        // Calcola la nuova larghezza totale della tabella
        const totalWidth = columns.reduce((sum, col) => 
          sum + (col.id === resizingColumnId ? newWidth : col.width), 0
        ) + 60; // +60 per la colonna azioni
        
        // Aggiorna la larghezza della tabella senza spostarla
        const tableElement = document.querySelector(`[data-table-id="${id}"]`);
        if (tableElement && tableElement.parentElement) {
          (tableElement.parentElement as any).setAttribute('width', totalWidth);
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isResizing && resizingColumnId) {
        const deltaX = e.clientX - (window as any).resizeStartX;
        const currentColumn = columns.find(col => col.id === resizingColumnId);
        if (!currentColumn) {
          // Reset dello stato anche se la colonna non è trovata
          stopResize();
          return;
        }
        
        // Calcola larghezza minima basata sul contenuto
        const minWidth = Math.max(120, getMinColumnWidth(currentColumn, rows));
        const newWidth = Math.max(minWidth, (window as any).resizeStartWidth + deltaX);
        
        // Aggiorna la colonna nella tabella
        const updatedColumns = columns.map(col => 
          col.id === resizingColumnId ? { ...col, width: newWidth } : col
        );
        
        // Calcola la nuova larghezza totale della tabella
        const totalWidth = updatedColumns.reduce((sum, col) => sum + col.width, 0) + 60;
        
        // Aggiorna sia le colonne che la larghezza della tabella
        updateTable(id, { 
          columns: updatedColumns,
          width: totalWidth
        });
        
        // Ripristina cursore
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // IMPORTANTE: Reset dello stato per fermare il resize
        stopResize();
      }
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, resizingColumnId, columns, updateTable, id, rows, stopResize]);

  // Funzione per calcolare la larghezza minima di una colonna
  const getMinColumnWidth = (column: TableColumn, rows: TableRow[]) => {
    let minWidth = column.name.length * 8 + 60; // Larghezza del nome + padding
    
    // Controlla il contenuto delle celle
    rows.forEach(row => {
      const cell = row.cells.find(c => c.columnId === column.id);
      if (cell && cell.value) {
        let contentWidth = 60; // Padding base
        
        switch (column.type) {
          case TableColumnType.Text:
            contentWidth += String(cell.value).length * 8;
            break;
          case TableColumnType.Number:
            contentWidth += String(cell.value).length * 10;
            break;
          case TableColumnType.Date:
            contentWidth += 100; // Larghezza fissa per date
            break;
          case TableColumnType.Image:
            contentWidth += 140; // Larghezza per immagini
            break;
          case TableColumnType.Select:
          case TableColumnType.MultiSelect:
            if (column.options) {
              const option = column.options.find(opt => opt.id === cell.value);
              if (option) {
                contentWidth += option.label.length * 8 + 40;
              }
            }
            break;
        }
        
        minWidth = Math.max(minWidth, contentWidth);
      }
    });
    
    return Math.min(minWidth, 300); // Max 300px
  };

  // Calcola altezza dinamica basata sul contenuto
  const calculateDynamicHeight = () => {
    const titleHeight = title ? 60 : 0;
    const headerHeight = 48;
    const footerHeight = 48; // Riga per aggiungere
    const rowHeight = 60; // Altezza base per riga (aumentata per immagini)
    
    // Calcola altezza extra per righe con immagini
    const extraHeight = rows.reduce((total, row) => {
      const hasImages = row.cells.some(cell => {
        const column = columns.find(col => col.id === cell.columnId);
        return column?.type === TableColumnType.Image && cell.value;
      });
      return total + (hasImages ? 20 : 0); // Extra height per righe con immagini
    }, 0);
    
    return titleHeight + headerHeight + (rows.length * rowHeight) + footerHeight + extraHeight;
  };

  const dynamicHeight = Math.max(calculateDynamicHeight(), height); // Usa il maggiore tra altezza calcolata e manuale

  return (
    <foreignObject
      x={x}
      y={y}
      width={width}
      height={height} // Usa l'altezza del layer, non quella calcolata
      onPointerDown={(e) => {
        // Permetti movimento della tabella per click sui bordi o drag handle
        const target = e.target as HTMLElement;
        const isGripHandle = target.closest('.table-drag-handle') || target.classList.contains('table-drag-handle');
        const isResizeHandle = target.classList.contains('resize-handle') || target.closest('.resize-handle');
        const isTableResize = target.classList.contains('table-resize-handle') || target.closest('.table-resize-handle');
        
        if (isGripHandle || (!isResizeHandle && !isTableResize && !target.closest('.table-content'))) {
          onPointerDown(e, id);
        } else {
          // Blocca la propagazione solo per elementi interni specifici
          e.stopPropagation();
        }
      }}
      style={{
        outline: isSelected ? `2px solid ${selectionColor}` : "none",
        outlineOffset: isSelected ? "2px" : "0",
      }}
      className="drop-shadow-lg"
      data-table-container="true"
      data-table-id={id}
    >
      <div 
        className="w-full h-full rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm relative table-content"
        style={{
          backgroundColor: colorToCSS(fill),
          borderColor: borderColor ? colorToCSS(borderColor) : "#e5e7eb",
          height: height,
        }}
      >
        {/* Titolo della tabella */}
        {title && (
          <div 
            className="px-6 py-3 border-b border-gray-200 font-semibold text-base text-gray-900 flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100"
            style={{
              backgroundColor: headerColor ? colorToCSS(headerColor) : undefined,
              borderBottomColor: borderColor ? colorToCSS(borderColor) : "#e5e7eb",
            }}
          >
            <div className="flex items-center gap-2">
              <div className="table-drag-handle cursor-move" title="Trascina per spostare la tabella">
                <GripVertical className="h-4 w-4 text-gray-400" />
              </div>
              <EditableTitle 
                value={title} 
                onSave={(newValue) => updateTable(id, { title: newValue })}
              />
              <Badge variant="outline" className="text-xs">
                {rows.length} {rows.length === 1 ? 'row' : 'rows'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  addRow();
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add row
              </Button>
            </div>
          </div>
        )}

        {/* Header delle colonne */}
        <div 
          className="flex border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 relative"
          style={{
            height: headerHeight,
            backgroundColor: headerColor ? colorToCSS(headerColor) : undefined,
            borderBottomColor: borderColor ? colorToCSS(borderColor) : "#e5e7eb",
          }}
        >
          {/* Indicatore di larghezza durante il resize - NASCOSTO */}
          {false && isResizing && (
            <div 
              className="absolute top-0 left-0 bg-blue-500 text-white text-xs px-2 py-1 rounded shadow-lg z-20 pointer-events-none"
              style={{
                transform: 'translateY(-100%)',
                left: `${(window as any).resizeStartX - 300}px` // Posiziona sopra il cursore
              }}
            >
              Width: {Math.max(100, Math.min(800, (window as any).resizeStartWidth + ((window as any).currentX || 0) - (window as any).resizeStartX))}px
            </div>
          )}

          {columns.map((column, index) => {
            const IconComponent = getColumnTypeIcon(column.type);
            const isDraggedColumn = draggedColumnId === column.id;
            const isDragOverColumn = dragOverColumnId === column.id;
            
            return (
              <div
                key={column.id}
                data-column-id={column.id}
                data-column-type={column.type === TableColumnType.Image ? "image" : undefined}
                draggable={column.type !== TableColumnType.Image}
                onDragStart={(e) => {
                  if (column.type === TableColumnType.Image) {
                    e.preventDefault();
                    return;
                  }
                  e.stopPropagation();
                  handleColumnDragStart(e, column.id);
                }}
                onDragOver={(e) => {
                  if (column.type === TableColumnType.Image) {
                    e.preventDefault();
                    return;
                  }
                  e.stopPropagation();
                  handleColumnDragOver(e, column.id);
                }}
                onDragLeave={(e) => {
                  if (column.type === TableColumnType.Image) {
                    return;
                  }
                  e.stopPropagation();
                  handleColumnDragLeave();
                }}
                onDrop={(e) => {
                  if (column.type === TableColumnType.Image) {
                    e.preventDefault();
                    return;
                  }
                  e.stopPropagation();
                  handleColumnDrop(e, column.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={`flex items-center gap-3 px-4 py-3 border-r border-gray-200 last:border-r-0 font-semibold text-sm text-gray-700 group hover:bg-gray-100/50 transition-colors relative ${
                  column.type !== TableColumnType.Image ? 'cursor-move' : ''
                } ${
                  isDraggedColumn ? 'opacity-50' : ''
                } ${isDragOverColumn ? 'bg-blue-100 border-l-4 border-l-blue-500' : ''}`}
                style={{
                  width: column.width,
                  borderRightColor: borderColor ? colorToCSS(borderColor) : "#e5e7eb",
                }}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0 pointer-events-none">
                  <IconComponent className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <EditableTitle 
                    value={column.name} 
                    onSave={(newValue) => updateColumn(index, { ...column, name: newValue })}
                    className="text-sm font-semibold pointer-events-auto"
                  />
                  {column.required && (
                    <span className="text-red-500 text-xs">*</span>
                  )}
                </div>
                
                <div className="flex items-center gap-1 pointer-events-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsColumn(column);
                    }}
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end" 
                      className="z-[300] bg-white shadow-lg border border-gray-200 rounded-md"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <DropdownMenuLabel>Column actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          removeColumn(column.id);
                        }}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-3 w-3 mr-2" />
                        Delete column
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Handle di resize - visibile solo se non è l'ultima colonna */}
                {index < columns.length - 1 && (
                  <div
                    className="resize-handle absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 hover:w-1.5 transition-all z-10 group-hover:opacity-100 opacity-0 pointer-events-auto"
                    style={{
                      backgroundColor: isResizing && resizingColumnId === column.id ? '#3b82f6' : 'transparent'
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, column.id, column.width);
                    }}
                    title="Trascina per ridimensionare la colonna"
                  />
                )}
              </div>
            );
          })}
          
          {/* Colonna per aggiungere nuove colonne */}
          <div className="flex items-center justify-center px-3 min-w-[60px] border-r-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="ml-2 h-8 px-2 border-dashed"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Column
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="start" 
                className="z-[300] bg-white shadow-lg border border-gray-200 rounded-md"
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuItem onClick={() => addColumn(TableColumnType.Text)}>
                  <Type className="h-4 w-4 mr-2" />
                  Text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addColumn(TableColumnType.Number)}>
                  <Hash className="h-4 w-4 mr-2" />
                  Number
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addColumn(TableColumnType.Date)}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Date
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addColumn(TableColumnType.Select)}>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Single select
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addColumn(TableColumnType.MultiSelect)}>
                  <List className="h-4 w-4 mr-2" />
                  Multi select
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addColumn(TableColumnType.Image)}>
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Image
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Righe della tabella */}
        <div className="flex-1 overflow-auto" style={{ 
          maxHeight: `calc(${height}px - ${title ? 60 : 0}px - 48px - 48px)`, // -48px per header, -48px per footer
          minHeight: `${Math.min(rows.length * 60 + 20, height - (title ? 60 : 0) - 48 - 48)}px` // Minimo per contenere le righe
        }}>
          {rows.map((row, rowIndex) => {
            const hasImages = row.cells.some(cell => {
              const column = columns.find(col => col.id === cell.columnId);
              return column?.type === TableColumnType.Image && cell.value;
            });
            const rowHeight = hasImages ? 80 : 60;
            
            return (
              <div
                key={row.id}
                className={`flex border-b border-gray-100 last:border-b-0 hover:bg-blue-50/30 group transition-colors ${
                  alternateRowColors && rowIndex % 2 === 1 ? "bg-gray-50/30" : "bg-white"
                }`}
                style={{
                  minHeight: rowHeight,
                  borderBottomColor: borderColor ? colorToCSS(borderColor) : "#f3f4f6",
                }}
                data-row-id={row.id}
              >
                {columns.map((column) => {
                  const cell = row.cells.find(c => c.columnId === column.id) || {
                    columnId: column.id,
                    value: column.type === TableColumnType.Select ? "" :
                           column.type === TableColumnType.MultiSelect ? [] : ""
                  };
                  
                  const cellId = `${row.id}-${column.id}`;
                  const isImageColumn = column.type === TableColumnType.Image;
                  const isDraggedOver = draggedOver === cellId;
                  
                  return (
                    <div
                      key={column.id}
                      data-column-id={column.id}
                      data-column-type={column.type === TableColumnType.Image ? "image" : undefined}
                      className={`flex px-4 py-3 border-r border-gray-100 last:border-r-0 transition-all ${
                        isImageColumn ? 'relative items-center justify-center' : 'items-start'
                      } ${isDraggedOver ? 'bg-blue-100 border-blue-300' : ''}`}
                      style={{
                        width: column.width,
                        borderRightColor: borderColor ? colorToCSS(borderColor) : "#f3f4f6",
                        minHeight: isImageColumn && cell.value ? "80px" : "44px"
                      }}
                      // Blocca propagazione per celle non-Image
                      onPointerDown={!isImageColumn ? (e) => e.stopPropagation() : undefined}
                      onClick={!isImageColumn ? (e) => e.stopPropagation() : undefined}
                      // Aggiungi eventi drag & drop solo per colonne Image
                      {...(isImageColumn ? {
                        onDragOver: (e) => {
                          e.stopPropagation();
                          handleDragOver(e, cellId);
                        },
                        onDragLeave: (e) => {
                          e.stopPropagation();
                          handleDragLeave(e);
                        },
                        onDrop: (e) => {
                          e.stopPropagation();
                          handleDrop(e, row.id, column.id);
                        }
                      } : {})}
                    >
                      <div className={`w-full ${isImageColumn ? 'h-full flex items-center justify-center' : 'min-h-[20px] flex items-center'}`}>
                        <EditableCell 
                          cell={cell} 
                          column={column} 
                          onUpdate={(value) => updateCellWithResize(row.id, column.id, value)}
                        />
                      </div>
                      
                      {/* Overlay per drag & drop su colonne Image */}
                      {isImageColumn && isDraggedOver && (
                        <div className="absolute inset-0 bg-blue-100/80 border-2 border-dashed border-blue-400 rounded flex items-center justify-center pointer-events-none">
                          <div className="text-blue-600 text-xs font-medium flex items-center gap-1">
                            <ImageIcon className="h-3 w-3" />
                            Rilascia elemento qui
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {/* Colonna per azioni riga */}
                <div className="flex items-center justify-center px-3 min-w-[60px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRow(row.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
          
          {/* Riga per aggiungere nuova riga - sempre visibile */}
          <div 
            className="flex items-center px-4 py-3 text-gray-500 hover:bg-blue-50/50 cursor-pointer transition-colors border-dashed border-t border-gray-200 bg-white"
            style={{ height: 48 }}
            onClick={(e) => {
              e.stopPropagation();
              addRow();
            }}
          >
            <Plus className="h-4 w-4 mr-2 text-blue-500" />
            <span className="text-sm font-medium text-blue-600">Add new row</span>
          </div>
        </div>
      </div>
      
      {/* Resize handles per la tabella */}
      {isSelected && (
        <>
          {/* Handle resize destro */}
          <div
            className="table-resize-handle absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-blue-500 opacity-60 hover:opacity-100 transition-opacity"
            style={{ transform: 'translateX(100%)' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              const startX = e.clientX;
              const startWidth = width;
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const newWidth = Math.max(300, startWidth + (moveEvent.clientX - startX));
                updateTable(id, { width: newWidth });
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
          
          {/* Handle resize inferiore */}
          <div
            className="table-resize-handle absolute bottom-0 left-0 right-0 h-2 cursor-row-resize bg-blue-500 opacity-60 hover:opacity-100 transition-opacity"
            style={{ transform: 'translateY(100%)' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              const startY = e.clientY;
              const startHeight = height;
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const newHeight = Math.max(200, startHeight + (moveEvent.clientY - startY));
                updateTable(id, { height: newHeight });
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
          
          {/* Handle resize angolo inferiore destro */}
          <div
            className="table-resize-handle absolute bottom-0 right-0 w-3 h-3 cursor-nw-resize bg-blue-600 opacity-80 hover:opacity-100 transition-opacity"
            style={{ transform: 'translate(100%, 100%)' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              const startX = e.clientX;
              const startY = e.clientY;
              const startWidth = width;
              const startHeight = height;
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const newWidth = Math.max(300, startWidth + (moveEvent.clientX - startX));
                const newHeight = Math.max(200, startHeight + (moveEvent.clientY - startY));
                updateTable(id, { width: newWidth, height: newHeight });
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
        </>
      )}
      
      {/* Dialog delle impostazioni colonna */}
      {settingsColumn && (
        <ColumnSettingsDialog
          column={settingsColumn}
          isOpen={!!settingsColumn}
          onClose={() => setSettingsColumn(null)}
          onSave={(updatedColumn) => {
            const columnIndex = columns.findIndex(col => col.id === updatedColumn.id);
            if (columnIndex !== -1) {
              updateColumn(columnIndex, updatedColumn);
            }
          }}
        />
      )}
    </foreignObject>
  );
});

Table.displayName = "Table"; 