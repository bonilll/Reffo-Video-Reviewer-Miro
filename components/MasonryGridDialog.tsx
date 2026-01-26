"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSelection } from "@/hooks/useSelection";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Alignment = "left" | "center" | "right";

type MasonrySettings = {
  columns: number;
  gapX: number;
  gapY: number;
  normalizeWidth: boolean;
  alignment: Alignment;
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
        <DialogContent className="sm:max-w-[450px]">
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
              <div className="grid grid-cols-[1fr,3fr] gap-4 items-center">
                <Input
                  id="columns"
                  type="number"
                  min={1}
                  max={100}
                  value={settings.columns}
                  onChange={(e) => setSettings({
                    ...settings,
                    columns: Math.max(1, Math.min(100, parseInt(e.target.value) || 1))
                  })}
                  className="w-20"
                />
                <Slider 
                  value={[settings.columns]} 
                  min={1} 
                  max={100} 
                  step={1}
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
                <div className="grid grid-cols-[2fr,1fr,3fr] gap-4 items-center">
                  <Label htmlFor="gapX" className="text-sm">Orizzontale</Label>
                  <Input
                    id="gapX"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.gapX}
                    onChange={(e) => setSettings({
                      ...settings,
                      gapX: Math.max(0, parseInt(e.target.value) || 0)
                    })}
                    className="w-20"
                  />
                  <Slider
                    value={[settings.gapX]}
                    min={0}
                    max={50}
                    step={1}
                    onValueChange={(value: number[]) => setSettings({
                      ...settings,
                      gapX: value[0]
                    })}
                  />
                </div>
                
                <div className="grid grid-cols-[2fr,1fr,3fr] gap-4 items-center">
                  <Label htmlFor="gapY" className="text-sm">Verticale</Label>
                  <Input
                    id="gapY"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.gapY}
                    onChange={(e) => setSettings({
                      ...settings,
                      gapY: Math.max(0, parseInt(e.target.value) || 0)
                    })}
                    className="w-20"
                  />
                  <Slider
                    value={[settings.gapY]}
                    min={0}
                    max={50}
                    step={1}
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