"use client";

import { useState, useMemo } from "react";
import { ReviewAnnotation, ReviewComment } from "@/types/canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  Eye, 
  EyeOff, 
  Trash2, 
  Copy, 
  Edit3,
  MessageSquare,
  Pencil,
  Square,
  Circle,
  ArrowUp,
  Type,
  ChevronDown,
  ChevronRight,
  Calendar,
  User,
  Hash
} from "lucide-react";

interface ReviewAnnotationManagerProps {
  annotations: ReviewAnnotation[];
  comments: ReviewComment[];
  selectedAnnotationIds: string[];
  onAnnotationSelect: (annotationIds: string[]) => void;
  onAnnotationDelete: (annotationIds: string[]) => void;
  onAnnotationDuplicate: (annotationIds: string[]) => void;
  onAnnotationToggleVisibility: (annotationIds: string[], visible: boolean) => void;
  onFrameJump: (frameNumber: number) => void;
  theme?: 'dark' | 'light';
  currentFrame: number;
}

type FilterType = 'all' | 'freehand' | 'rectangle' | 'circle' | 'arrow';
type SortBy = 'created' | 'frame' | 'type' | 'author';

const annotationIcons = {
  freehand: Pencil,
  rectangle: Square,
  circle: Circle,
  arrow: ArrowUp,
  text: Type
};

const annotationColors = {
  freehand: 'bg-purple-100 text-purple-800',
  rectangle: 'bg-blue-100 text-blue-800',
  circle: 'bg-green-100 text-green-800',
  arrow: 'bg-orange-100 text-orange-800',
  text: 'bg-gray-100 text-gray-800'
};

export function ReviewAnnotationManager({
  annotations,
  comments,
  selectedAnnotationIds,
  onAnnotationSelect,
  onAnnotationDelete,
  onAnnotationDuplicate,
  onAnnotationToggleVisibility,
  onFrameJump,
  theme = 'light',
  currentFrame
}: ReviewAnnotationManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortBy>('created');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedFrames, setExpandedFrames] = useState<Set<number>>(new Set([currentFrame]));

  // Theme classes
  const themeClasses = {
    container: theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900',
    input: theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900',
    button: theme === 'dark' ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600',
    buttonActive: theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white',
    item: theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-50',
    itemSelected: theme === 'dark' ? 'bg-blue-900/30 border-blue-500' : 'bg-blue-50 border-blue-300',
    text: {
      primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-400' : 'text-gray-600',
      muted: theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
    }
  };

  // Filter and sort annotations
  const filteredAnnotations = useMemo(() => {
    let filtered = annotations.filter(annotation => {
      // Filter by type
      if (filterType !== 'all' && annotation.type !== filterType) return false;
      
      // Filter by search query
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        return (
          annotation.textContent?.toLowerCase().includes(searchLower) ||
          annotation.createdByName.toLowerCase().includes(searchLower) ||
          annotation.type.toLowerCase().includes(searchLower)
        );
      }
      
      return true;
    });

    // Sort annotations
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'frame':
          return (a.frameNumber || 0) - (b.frameNumber || 0);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'author':
          return a.createdByName.localeCompare(b.createdByName);
        default:
          return 0;
      }
    });

    return filtered;
  }, [annotations, filterType, searchQuery, sortBy]);

  // Group annotations by frame
  const annotationsByFrame = useMemo(() => {
    const groups = new Map<number, ReviewAnnotation[]>();
    filteredAnnotations.forEach(annotation => {
      const frame = annotation.frameNumber || 0;
      if (!groups.has(frame)) {
        groups.set(frame, []);
      }
      groups.get(frame)!.push(annotation);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [filteredAnnotations]);

  // Comments by frame
  const commentsByFrame = useMemo(() => {
    const groups = new Map<number, ReviewComment[]>();
    comments.forEach(comment => {
      const frame = comment.frameNumber || 0;
      if (!groups.has(frame)) {
        groups.set(frame, []);
      }
      groups.get(frame)!.push(comment);
    });
    return groups;
  }, [comments]);

  const toggleFrameExpanded = (frame: number) => {
    const newExpanded = new Set(expandedFrames);
    if (newExpanded.has(frame)) {
      newExpanded.delete(frame);
    } else {
      newExpanded.add(frame);
    }
    setExpandedFrames(newExpanded);
  };

  const handleAnnotationClick = (annotationId: string, ctrlKey: boolean) => {
    if (ctrlKey) {
      if (selectedAnnotationIds.includes(annotationId)) {
        onAnnotationSelect(selectedAnnotationIds.filter(id => id !== annotationId));
      } else {
        onAnnotationSelect([...selectedAnnotationIds, annotationId]);
      }
    } else {
      onAnnotationSelect([annotationId]);
    }
  };

  const handleBulkAction = (action: 'delete' | 'duplicate' | 'hide' | 'show') => {
    if (selectedAnnotationIds.length === 0) return;

    switch (action) {
      case 'delete':
        onAnnotationDelete(selectedAnnotationIds);
        break;
      case 'duplicate':
        onAnnotationDuplicate(selectedAnnotationIds);
        break;
      case 'hide':
        onAnnotationToggleVisibility(selectedAnnotationIds, false);
        break;
      case 'show':
        onAnnotationToggleVisibility(selectedAnnotationIds, true);
        break;
    }
  };

  return (
    <div className={`w-80 h-full flex flex-col ${themeClasses.container} border-l`}>
      {/* Header */}
      <div className="p-4 border-b border-current/10">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`font-semibold ${themeClasses.text.primary}`}>
            Annotazioni & Commenti
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? themeClasses.buttonActive : themeClasses.button}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca annotazioni..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-10 ${themeClasses.input}`}
          />
        </div>

        {/* Stats */}
        <div className="flex gap-2 text-xs">
          <Badge variant="secondary">
            {filteredAnnotations.length} annotazioni
          </Badge>
          <Badge variant="secondary">
            {comments.length} commenti
          </Badge>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-1 flex-wrap">
              {(['all', 'freehand', 'rectangle', 'circle', 'arrow', 'text'] as FilterType[]).map((type) => (
                <Button
                  key={type}
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterType(type)}
                  className={`h-7 px-2 text-xs ${
                    filterType === type ? themeClasses.buttonActive : themeClasses.button
                  }`}
                >
                  {type === 'all' ? 'Tutti' : type}
                </Button>
              ))}
            </div>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className={`text-xs p-1 rounded ${themeClasses.input}`}
            >
              <option value="created">Ordina per data</option>
              <option value="frame">Ordina per frame</option>
              <option value="type">Ordina per tipo</option>
              <option value="author">Ordina per autore</option>
            </select>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedAnnotationIds.length > 0 && (
        <div className="p-3 border-b border-current/10 bg-blue-50/50">
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => handleBulkAction('duplicate')}>
              <Copy className="h-3 w-3 mr-1" />
              Duplica
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleBulkAction('hide')}>
              <EyeOff className="h-3 w-3 mr-1" />
              Nascondi
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleBulkAction('delete')} className="text-red-600">
              <Trash2 className="h-3 w-3 mr-1" />
              Elimina
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {annotationsByFrame.length === 0 ? (
          <div className="p-4 text-center">
            <div className={`text-sm ${themeClasses.text.muted}`}>
              Nessuna annotazione trovata
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {annotationsByFrame.map(([frameNumber, frameAnnotations]) => {
              const frameComments = commentsByFrame.get(frameNumber) || [];
              const isExpanded = expandedFrames.has(frameNumber);
              const isCurrentFrame = frameNumber === currentFrame;

              return (
                <div key={frameNumber} className="border-b border-current/5">
                  {/* Frame Header */}
                  <div 
                    className={`p-3 cursor-pointer transition-colors ${
                      isCurrentFrame ? 'bg-blue-100 dark:bg-blue-900/20' : themeClasses.item
                    }`}
                    onClick={() => {
                      toggleFrameExpanded(frameNumber);
                      onFrameJump(frameNumber);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <Hash className="h-4 w-4" />
                        <span className={`font-medium ${themeClasses.text.primary}`}>
                          Frame {frameNumber}
                        </span>
                        {isCurrentFrame && (
                          <Badge variant="default" className="text-xs">
                            Corrente
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {frameAnnotations.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {frameAnnotations.length}
                          </Badge>
                        )}
                        {frameComments.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            💬 {frameComments.length}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Frame Content */}
                  {isExpanded && (
                    <div className="pb-2">
                      {/* Annotations */}
                      {frameAnnotations.map((annotation) => {
                        const Icon = annotationIcons[annotation.type];
                        const isSelected = selectedAnnotationIds.includes(annotation._id);

                        return (
                          <div
                            key={annotation._id}
                            className={`mx-3 mb-1 p-2 rounded border cursor-pointer transition-all ${
                              isSelected ? themeClasses.itemSelected : themeClasses.item
                            }`}
                            onClick={(e) => handleAnnotationClick(annotation._id, e.ctrlKey)}
                          >
                            <div className="flex items-start gap-2">
                              <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-xs px-2 py-0.5 rounded ${annotationColors[annotation.type]}`}>
                                    {annotation.type}
                                  </span>
                                  {!annotation.isVisible && (
                                    <EyeOff className="h-3 w-3 text-gray-400" title="Nascosta" />
                                  )}
                                </div>
                                {annotation.textContent && (
                                  <div className={`text-sm mb-1 ${themeClasses.text.primary}`}>
                                    {annotation.textContent}
                                  </div>
                                )}
                                <div className={`text-xs ${themeClasses.text.secondary}`}>
                                  <User className="h-3 w-3 inline mr-1" />
                                  {annotation.createdByName}
                                  <Calendar className="h-3 w-3 inline ml-2 mr-1" />
                                  {new Date(annotation.createdAt).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Comments */}
                      {frameComments.map((comment) => (
                        <div
                          key={comment._id}
                          className={`mx-3 mb-1 p-2 rounded border-l-4 border-green-400 ${themeClasses.item}`}
                        >
                          <div className="flex items-start gap-2">
                            <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600" />
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm mb-1 ${themeClasses.text.primary}`}>
                                {comment.content}
                              </div>
                              <div className={`text-xs ${themeClasses.text.secondary}`}>
                                <User className="h-3 w-3 inline mr-1" />
                                {comment.createdByName}
                                <Calendar className="h-3 w-3 inline ml-2 mr-1" />
                                {new Date(comment.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
} 