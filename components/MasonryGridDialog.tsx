"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSelection } from "@/hooks/useSelection";
import { LayoutGrid, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type Alignment = "left" | "center" | "right";

type MasonrySettings = {
  columns: number;
  gapX: number;
  gapY: number;
  normalizeWidth: boolean;
  alignment: Alignment;
};

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const StepperInput = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
}) => {
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const commit = (next: number) => {
    onChange(clampValue(next, min, max));
  };

  const handleBlur = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (Number.isNaN(parsed)) {
      setInputValue(value.toString());
      return;
    }
    commit(parsed);
  };

  return (
    <div className="flex items-center h-9 rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => commit(value - step)}
        disabled={value <= min}
        className="h-full px-2.5 text-slate-500 hover:bg-slate-100 border-r border-slate-200/70 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Decrease"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        id={id}
        type="text"
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="w-12 text-center text-sm font-semibold text-slate-700 bg-white outline-none border-0"
        inputMode="numeric"
      />
      <button
        type="button"
        onClick={() => commit(value + step)}
        disabled={value >= max}
        className="h-full px-2.5 text-slate-500 hover:bg-slate-100 border-l border-slate-200/70 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const MasonrySlider = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>) => {
  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-200">
        <SliderPrimitive.Range className="absolute h-full bg-black" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-black bg-white shadow-sm ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" />
    </SliderPrimitive.Root>
  );
};

export const MasonryGridDialog = () => {
  const { selectedLayers, updateLayerPositions, hasMultipleSelection } = useSelection();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<MasonrySettings>({
    columns: 3,
    gapX: 16,
    gapY: 16,
    normalizeWidth: true,
    alignment: "left"
  });

  if (!hasMultipleSelection) return null;

  const handleApply = () => {
    if (selectedLayers.length < 1) {
      toast.error("Seleziona almeno un elemento per applicare il layout");
      return;
    }

    // Calcola il bounding box totale
    const boundingBox = selectedLayers.reduce((acc, layer) => ({
      minX: Math.min(acc.minX, layer.x),
      minY: Math.min(acc.minY, layer.y),
      maxX: Math.max(acc.maxX, layer.x + layer.width),
      maxY: Math.max(acc.maxY, layer.y + layer.height)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

    const totalWidth = boundingBox.maxX - boundingBox.minX;
    
    // Calcola la larghezza della colonna
    const columnWidth = settings.normalizeWidth 
      ? (totalWidth - ((settings.columns - 1) * settings.gapX)) / settings.columns
      : totalWidth / settings.columns;

    // Inizializza le altezze delle colonne
    const columnHeights = new Array(settings.columns).fill(boundingBox.minY);
    
    // Calcola la posizione iniziale in base all'allineamento
    let startX = boundingBox.minX;
    const gridWidth = (columnWidth * settings.columns) + (settings.gapX * (settings.columns - 1));
    
    if (settings.alignment === "center") {
      startX = boundingBox.minX + (totalWidth - gridWidth) / 2;
    } else if (settings.alignment === "right") {
      startX = boundingBox.maxX - gridWidth;
    }
    
    const columnPositions = new Array(settings.columns).fill(startX)
      .map((x, i) => x + (i * (columnWidth + settings.gapX)));

    // 1. Prima ordiniamo i layer per posizione y, poi per posizione x
    const sortedLayers = [...selectedLayers].sort((a, b) => {
      // Priorità alla posizione y per mantenere l'ordine visivo originale
      if (Math.abs(a.y - b.y) > a.height / 2) {
        return a.y - b.y;
      }
      // Se sono circa alla stessa altezza, ordina per posizione x
      return a.x - b.x;
    });

    // 2. Ottimizza la distribuzione usando un algoritmo greedy migliorato
    const newPositions = sortedLayers.map((layer, index) => {
      // Determina la colonna target basata sull'indice per una distribuzione iniziale uniforme
      let targetColumn = index % settings.columns;
      
      // Verifica qual è la colonna con altezza minore per un posizionamento ottimale
      if (index >= settings.columns) {
        targetColumn = columnHeights.indexOf(Math.min(...columnHeights));
      }
      
      // Calcola le dimensioni mantenendo le proporzioni
      let newWidth = layer.width;
      let newHeight = layer.height;
      
      if (settings.normalizeWidth) {
        newWidth = columnWidth;
        // Mantiene l'aspect ratio
        const aspectRatio = layer.width / layer.height;
        newHeight = newWidth / aspectRatio;
      }
      
      // Posizione y basata sull'altezza corrente della colonna
      const newY = columnHeights[targetColumn];
      
      // Aggiorna l'altezza della colonna
      columnHeights[targetColumn] += newHeight + settings.gapY;
      
      return {
        id: layer.id,
        x: columnPositions[targetColumn],
        y: newY,
        // Aggiungere anche width e height per permettere il ridimensionamento
        ...(settings.normalizeWidth && { width: newWidth, height: newHeight })
      };
    });

    // Applica le nuove posizioni
    updateLayerPositions(newPositions);
    setOpen(false);
    toast.success("Layout Masonry applicato con successo");
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="rounded-full"
        title="Layout Masonry"
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[470px] bg-white text-slate-900 border border-slate-200/80 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Layout Masonry Grid</DialogTitle>
            <DialogDescription>
              Organizza gli elementi selezionati in una griglia a colonne di tipo Masonry.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="columns" className="text-sm font-medium">
                  Numero di colonne
                </Label>
                <span className="text-sm text-muted-foreground">{settings.columns}</span>
              </div>
              <div className="flex items-center gap-3">
                <StepperInput
                  id="columns"
                  value={settings.columns}
                  min={1}
                  max={100}
                  step={1}
                  onChange={(value) => setSettings({ ...settings, columns: value })}
                />
                <MasonrySlider
                  value={[settings.columns]} 
                  min={1} 
                  max={100} 
                  step={1}
                  className="flex-1"
                  onValueChange={(value: number[]) => setSettings({
                    ...settings,
                    columns: value[0]
                  })}
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Spaziatura</Label>
              </div>
              
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <Label htmlFor="gapX" className="text-sm min-w-[92px]">Orizzontale</Label>
                  <StepperInput
                    id="gapX"
                    value={settings.gapX}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(value) => setSettings({ ...settings, gapX: value })}
                  />
                  <MasonrySlider
                    value={[settings.gapX]}
                    min={0}
                    max={50}
                    step={1}
                    className="flex-1"
                    onValueChange={(value: number[]) => setSettings({
                      ...settings,
                      gapX: value[0]
                    })}
                  />
                </div>
                
                <div className="flex items-center gap-3">
                  <Label htmlFor="gapY" className="text-sm min-w-[92px]">Verticale</Label>
                  <StepperInput
                    id="gapY"
                    value={settings.gapY}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(value) => setSettings({ ...settings, gapY: value })}
                  />
                  <MasonrySlider
                    value={[settings.gapY]}
                    min={0}
                    max={50}
                    step={1}
                    className="flex-1"
                    onValueChange={(value: number[]) => setSettings({
                      ...settings,
                      gapY: value[0]
                    })}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                checked={settings.normalizeWidth}
                onCheckedChange={(checked: boolean) => setSettings({
                  ...settings,
                  normalizeWidth: checked
                })}
                id="normalize-width"
                className="data-[state=checked]:bg-black data-[state=unchecked]:bg-slate-200 [&>span]:bg-white"
              />
              <div>
                <Label htmlFor="normalize-width" className="text-sm font-medium">
                  Uniforma larghezza
                </Label>
                <p className="text-xs text-muted-foreground">
                  Imposta la stessa larghezza per tutti gli elementi
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Allineamento</Label>
              <RadioGroup
                value={settings.alignment}
                onValueChange={(value: string) => setSettings({
                  ...settings,
                  alignment: value as Alignment
                })}
                className="flex space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="left" id="align-left" />
                  <Label htmlFor="align-left" className="text-sm">Sinistra</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="center" id="align-center" />
                  <Label htmlFor="align-center" className="text-sm">Centro</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="right" id="align-right" />
                  <Label htmlFor="align-right" className="text-sm">Destra</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleApply}>
              Applica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}; 
