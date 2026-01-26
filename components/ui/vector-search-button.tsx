"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, X, Zap, Tags, Brain, Palette } from 'lucide-react';
import { Id } from '@/convex/_generated/dataModel';

interface VectorSearchButtonProps {
  assetId: Id<"assets">;
  onSearchSimilar: (assetId: Id<"assets">) => void;
  isActive?: boolean;
  onClear?: () => void;
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
  showLabel?: boolean;
}

export function VectorSearchButton({
  assetId,
  onSearchSimilar,
  isActive = false,
  onClear,
  className = "",
  variant = "outline",
  size = "sm",
  showLabel = true
}: VectorSearchButtonProps) {
  const handleClick = () => {
    if (isActive && onClear) {
      onClear();
    } else {
      onSearchSimilar(assetId);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleClick}
        variant={isActive ? "default" : variant}
        size={size}
        className={`${className} ${isActive ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
      >
        {isActive ? (
          <X className="w-4 h-4" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {showLabel && (
          <span className="ml-1">
            {isActive ? 'Cancel' : 'Find Similar'}
          </span>
        )}
      </Button>
      
      {isActive && (
        <Badge variant="secondary" className="bg-purple-100 text-purple-800">
          AI Search Active
        </Badge>
      )}
    </div>
  );
}

interface VectorSearchResultsHeaderProps {
  resultsCount: number;
  isLoading: boolean;
  onClear: () => void;
  similarityThreshold?: number;
  breakdown?: {
    vector: number;
    tags: number;
    ai: number;
    color: number;
  };
}

export function VectorSearchResultsHeader({
  resultsCount,
  isLoading,
  onClear,
  similarityThreshold = 0.6,
  breakdown
}: VectorSearchResultsHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg mb-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 rounded-full">
          <Sparkles className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">
            AI Visual Search
          </h3>
          <p className="text-sm text-gray-600">
            {isLoading ? (
              "Analyzing visual similarity with AI..."
            ) : (
              `${resultsCount} visually similar images found`
            )}
          </p>
          {breakdown && !isLoading && (
            <div className="flex items-center gap-2 mt-1">
              {breakdown.vector > 0 && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">
                  <Zap className="w-3 h-3 mr-1" />
                  {breakdown.vector} vector
                </Badge>
              )}
              {breakdown.tags > 0 && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                  <Tags className="w-3 h-3 mr-1" />
                  {breakdown.tags} tags
                </Badge>
              )}
              {breakdown.ai > 0 && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                  <Brain className="w-3 h-3 mr-1" />
                  {breakdown.ai} AI
                </Badge>
              )}
              {breakdown.color > 0 && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs">
                  <Palette className="w-3 h-3 mr-1" />
                  {breakdown.color} colors
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
      
      <Button
        onClick={onClear}
        variant="ghost"
        size="sm"
        className="text-gray-500 hover:text-gray-700"
      >
        <X className="w-4 h-4 mr-1" />
        Close
      </Button>
    </div>
  );
}

interface SimilarityBadgeProps {
  matchType: 'vector' | 'tags' | 'ai_description' | 'color';
  matchReason: string;
  similarityScore: number;
  className?: string;
}

export function SimilarityBadge({ 
  matchType, 
  matchReason, 
  similarityScore,
  className = ""
}: SimilarityBadgeProps) {
  const getMatchTypeConfig = (type: string) => {
    switch (type) {
      case 'vector':
        return {
          icon: Zap,
          color: 'bg-purple-100 text-purple-700 border-purple-200',
          label: 'Vector'
        };
      case 'tags':
        return {
          icon: Tags,
          color: 'bg-blue-100 text-blue-700 border-blue-200',
          label: 'Tags'
        };
      case 'ai_description':
        return {
          icon: Brain,
          color: 'bg-green-100 text-green-700 border-green-200',
          label: 'AI'
        };
      case 'color':
        return {
          icon: Palette,
          color: 'bg-orange-100 text-orange-700 border-orange-200',
          label: 'Colors'
        };
      default:
        return {
          icon: Sparkles,
          color: 'bg-gray-100 text-gray-700 border-gray-200',
          label: 'Similar'
        };
    }
  };

  const config = getMatchTypeConfig(matchType);
  const Icon = config.icon;
  const percentage = Math.round(similarityScore * 100);

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${config.color} ${className}`}>
      <Icon className="w-3 h-3" />
      <span>{config.label}</span>
      <span className="font-bold">{percentage}%</span>
    </div>
  );
}

interface VectorSearchLoadingProps {
  message?: string;
}

export function VectorSearchLoading({ 
  message = "Analyzing visual similarity with AI..." 
}: VectorSearchLoadingProps) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="flex items-center gap-3">
        <div className="animate-spin">
          <Sparkles className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <p className="font-medium text-gray-900">{message}</p>
          <p className="text-sm text-gray-500">
            Comparing visual features and patterns...
          </p>
        </div>
      </div>
    </div>
  );
}

interface VectorSearchEmptyProps {
  threshold: number;
  onAdjustThreshold?: (newThreshold: number) => void;
}

export function VectorSearchEmpty({ 
  threshold, 
  onAdjustThreshold 
}: VectorSearchEmptyProps) {
  const suggestedThresholds = [0.3, 0.4, 0.5, 0.6];
  
  return (
    <div className="text-center p-8">
      <div className="p-4 bg-gray-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
        <Sparkles className="w-8 h-8 text-gray-400" />
      </div>
      
      <h3 className="font-semibold text-gray-900 mb-2">
        No similar images found
      </h3>
      
      <p className="text-sm text-gray-500 mb-4">
        Try lowering the similarity threshold for broader results.
      </p>
      
      {onAdjustThreshold && (
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-gray-500">Threshold:</span>
          {suggestedThresholds.map((t) => (
            <Button
              key={t}
              onClick={() => onAdjustThreshold(t)}
              variant={t === threshold ? "default" : "outline"}
              size="sm"
              className="text-xs"
            >
              {Math.round(t * 100)}%
            </Button>
          ))}
        </div>
      )}
    </div>
  );
} 