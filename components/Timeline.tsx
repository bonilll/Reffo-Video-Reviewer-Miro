import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { Video, Annotation, Comment } from '../types';

interface TimelineProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  video: Video;
  annotations: Annotation[];
  comments: Comment[];
}

const Timeline: React.FC<TimelineProps> = ({ currentTime, duration, onSeek, video, annotations, comments }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const isSeeking = useRef(false);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getTimeFromMouseEvent = useCallback((e: MouseEvent): number => {
    const timeline = timelineRef.current;
    if (!timeline || duration <= 0) return 0;
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percentage = x / rect.width;
    return duration * percentage;
  }, [duration]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isSeeking.current) {
        onSeek(getTimeFromMouseEvent(e));
      }
    };

    const handleMouseUp = () => {
      if (isSeeking.current) {
        isSeeking.current = false;
      }
    };

    // Attach listeners to window to capture mouse events outside the timeline
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getTimeFromMouseEvent, onSeek]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isSeeking.current = true;
    onSeek(getTimeFromMouseEvent(e.nativeEvent));
  };

  const markers = useMemo(() => {
    const markerFrames = new Set<number>();
    annotations.forEach(a => markerFrames.add(a.frame));
    comments.forEach(c => c.frame !== undefined && markerFrames.add(c.frame));
    
    return Array.from(markerFrames).map(frame => ({
      frame,
      // Guard against division by zero if duration is not loaded yet
      position: duration > 0 && video.fps > 0 ? (frame / (duration * video.fps)) * 100 : 0,
    }));
  }, [annotations, comments, duration, video.fps]);

  const frameMarkers = useMemo(() => {
    if (duration <= 0) return [];
    const totalFrames = Math.floor(duration * video.fps);
    const markers = [];
    
    // Determine a good interval for markers
    let interval = 100;
    if (totalFrames < 200) interval = 25;
    else if (totalFrames < 1000) interval = 50;
    else if (totalFrames < 5000) interval = 250;
    else if (totalFrames < 10000) interval = 500;
    else interval = 1000;

    for (let frame = interval; frame < totalFrames; frame += interval) {
      markers.push({
        frame,
        position: (frame / totalFrames) * 100,
      });
    }
    return markers;

  }, [duration, video.fps]);

  return (
    <div className="w-full group px-2">
      <div 
        ref={timelineRef}
        className="relative h-2 bg-gray-700 rounded-full cursor-pointer" 
        onMouseDown={handleMouseDown}
      >
        <div 
            className="absolute top-0 left-0 h-full bg-gray-500 rounded-full" 
            style={{ width: `${progress}%` }}
        />
        <div 
            className="absolute top-0 left-0 h-full bg-cyan-500 rounded-full" 
            style={{ width: `${progress}%` }}
        />
        <div
          className="absolute h-4 w-4 bg-white rounded-full -top-1 transform -translate-x-1/2 transition-transform group-hover:scale-110"
          style={{ left: `${progress}%` }}
        />
        {markers.map(({ frame, position }) => (
            <div 
                key={`note-marker-${frame}`}
                className="absolute -top-1 h-4 w-0.5 bg-yellow-400"
                style={{ left: `${position}%` }}
                title={`Note at frame ${frame}`}
            />
        ))}
        {frameMarkers.map(({frame, position}) => (
          <div key={`frame-marker-${frame}`} className="absolute -bottom-5 text-xs text-gray-400 transform -translate-x-1/2" style={{ left: `${position}%` }}>
            {frame}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;