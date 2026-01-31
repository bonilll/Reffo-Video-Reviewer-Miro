"use client";

import { useState } from "react";
import { TableColumnType, TableColumn, TableSelectOption, Color } from "@/types/canvas";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Plus, 
  Trash2, 
  Type, 
  Hash, 
  Calendar, 
  Check, 
  ChevronDown,
  Image as ImageIcon,
  Link,
  Mail,
  Phone,
  GripVertical
} from "lucide-react";

interface TableConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: TableConfig) => void;
}

interface TableConfig {
  title: string;
  columns: TableColumn[];
  rows: number;
  width: number;
  height: number;
}

const COLUMN_TYPES = [
  { value: TableColumnType.Text, label: "Text", icon: Type },
  { value: TableColumnType.Number, label: "Number", icon: Hash },
  { value: TableColumnType.Date, label: "Date", icon: Calendar },
  { value: TableColumnType.Select, label: "Select", icon: ChevronDown },
  { value: TableColumnType.MultiSelect, label: "Multi Select", icon: ChevronDown },
  { value: TableColumnType.Checkbox, label: "Checkbox", icon: Check },
  { value: TableColumnType.Image, label: "Image", icon: ImageIcon },
  { value: TableColumnType.URL, label: "URL", icon: Link },
  { value: TableColumnType.Email, label: "Email", icon: Mail },
  { value: TableColumnType.Phone, label: "Phone", icon: Phone },
];

const DEFAULT_COLORS: Color[] = [
  { r: 76, g: 109, b: 255 },  // Electric Blue
  { r: 34, g: 211, b: 202 },  // Fresh Teal
  { r: 255, g: 107, b: 107 }, // Coral
  { r: 255, g: 193, b: 72 },  // Amber
  { r: 183, g: 148, b: 255 }, // Violet
  { r: 125, g: 193, b: 255 }, // Sky
  { r: 255, g: 167, b: 120 }, // Peach
  { r: 169, g: 232, b: 114 }, // Lime
];

const ColorPicker = ({ 
  selectedColor, 
  onColorChange 
}: { 
  selectedColor: Color; 
  onColorChange: (color: Color) => void;
}) => {
  return (
    <div className="flex gap-1 flex-wrap">
      {DEFAULT_COLORS.map((color, index) => (
        <button
          key={index}
          type="button"
          className={`w-6 h-6 rounded border-2 transition-all ${
            selectedColor.r === color.r && selectedColor.g === color.g && selectedColor.b === color.b
              ? "border-gray-400 scale-110" 
              : "border-gray-200 hover:border-gray-300"
          }`}
          style={{ 
            backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` 
          }}
          onClick={() => onColorChange(color)}
        />
      ))}
    </div>
  );
};

const ColumnEditor = ({ 
  column, 
  onUpdate, 
  onDelete 
}: { 
  column: TableColumn; 
  onUpdate: (column: TableColumn) => void;
  onDelete: () => void;
}) => {
  const [options, setOptions] = useState<TableSelectOption[]>(column.options || []);

  const addOption = () => {
    const newOption: TableSelectOption = {
      id: `option_${Date.now()}`,
      label: `Option ${options.length + 1}`,
      color: DEFAULT_COLORS[options.length % DEFAULT_COLORS.length]
    };
    const newOptions = [...options, newOption];
    setOptions(newOptions);
    onUpdate({ ...column, options: newOptions });
  };

  const updateOption = (index: number, updates: Partial<TableSelectOption>) => {
    const newOptions = options.map((opt, i) => 
      i === index ? { ...opt, ...updates } : opt
    );
    setOptions(newOptions);
    onUpdate({ ...column, options: newOptions });
  };

  const deleteOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    onUpdate({ ...column, options: newOptions });
  };

  const selectedType = COLUMN_TYPES.find(t => t.value === column.type);

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
      <div className="flex items-center gap-3">
        <GripVertical className="h-4 w-4 text-gray-400" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor={`column-name-${column.id}`}>Column Name</Label>
              <Input
                id={`column-name-${column.id}`}
                value={column.name}
                onChange={(e) => onUpdate({ ...column, name: e.target.value })}
                placeholder="Enter column name"
              />
            </div>
            <div className="w-40">
              <Label htmlFor={`column-type-${column.id}`}>Type</Label>
              <Select 
                value={column.type} 
                onValueChange={(value) => onUpdate({ ...column, type: value as TableColumnType })}
              >
                <SelectTrigger>
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      {selectedType && <selectedType.icon className="h-4 w-4" />}
                      {selectedType?.label}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COLUMN_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <Label htmlFor={`column-width-${column.id}`}>Width</Label>
              <Input
                id={`column-width-${column.id}`}
                type="number"
                value={column.width}
                onChange={(e) => onUpdate({ ...column, width: parseInt(e.target.value) || 120 })}
                min="80"
                max="400"
              />
            </div>
          </div>

          {/* Opzioni per Select e MultiSelect */}
          {(column.type === TableColumnType.Select || column.type === TableColumnType.MultiSelect) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOption}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Option
                </Button>
              </div>
              
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {options.map((option, index) => (
                  <div key={option.id} className="flex items-center gap-2 p-2 bg-white rounded border">
                    <Input
                      value={option.label}
                      onChange={(e) => updateOption(index, { label: e.target.value })}
                      placeholder="Option label"
                      className="flex-1"
                    />
                    <div className="flex items-center gap-2">
                      <ColorPicker
                        selectedColor={option.color}
                        onColorChange={(color) => updateOption(index, { color })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteOption(index)}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export const TableConfigDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm 
}: TableConfigDialogProps) => {
  const [config, setConfig] = useState<TableConfig>({
    title: "New Table",
    columns: [
      {
        id: "col_1",
        name: "Name",
        type: TableColumnType.Text,
        width: 150,
        required: false
      }
    ],
    rows: 5,
    width: 600,
    height: 400
  });

  const addColumn = () => {
    const newColumn: TableColumn = {
      id: `col_${Date.now()}`,
      name: `Column ${config.columns.length + 1}`,
      type: TableColumnType.Text,
      width: 120,
      required: false
    };
    setConfig(prev => ({
      ...prev,
      columns: [...prev.columns, newColumn]
    }));
  };

  const updateColumn = (index: number, column: TableColumn) => {
    setConfig(prev => ({
      ...prev,
      columns: prev.columns.map((col, i) => i === index ? column : col)
    }));
  };

  const deleteColumn = (index: number) => {
    if (config.columns.length > 1) {
      setConfig(prev => ({
        ...prev,
        columns: prev.columns.filter((_, i) => i !== index)
      }));
    }
  };

  const handleConfirm = () => {
    onConfirm(config);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Table</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Configurazione base */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="table-title">Table Title</Label>
              <Input
                id="table-title"
                value={config.title}
                onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter table title"
              />
            </div>
            <div>
              <Label htmlFor="table-rows">Initial Rows</Label>
              <Input
                id="table-rows"
                type="number"
                value={config.rows}
                onChange={(e) => setConfig(prev => ({ ...prev, rows: parseInt(e.target.value) || 1 }))}
                min="1"
                max="50"
              />
            </div>
          </div>

          {/* Dimensioni */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="table-width">Width (px)</Label>
              <Input
                id="table-width"
                type="number"
                value={config.width}
                onChange={(e) => setConfig(prev => ({ ...prev, width: parseInt(e.target.value) || 600 }))}
                min="300"
                max="1200"
              />
            </div>
            <div>
              <Label htmlFor="table-height">Height (px)</Label>
              <Input
                id="table-height"
                type="number"
                value={config.height}
                onChange={(e) => setConfig(prev => ({ ...prev, height: parseInt(e.target.value) || 400 }))}
                min="200"
                max="800"
              />
            </div>
          </div>

          {/* Colonne */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">Columns</Label>
              <Button
                type="button"
                variant="outline"
                onClick={addColumn}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Column
              </Button>
            </div>
            
            <div className="space-y-3">
              {config.columns.map((column, index) => (
                <ColumnEditor
                  key={column.id}
                  column={column}
                  onUpdate={(updatedColumn) => updateColumn(index, updatedColumn)}
                  onDelete={() => deleteColumn(index)}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Create Table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 
