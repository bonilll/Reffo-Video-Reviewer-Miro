import { Point, Annotation, AnnotationTool, RectangleAnnotation, EllipseAnnotation, ArrowAnnotation, FreehandAnnotation, Comment, TextAnnotation, ImageAnnotation, VideoAnnotation } from '../types';

interface VideoDimensions {
    containerWidth: number;
    containerHeight: number;
    videoWidth: number;
    videoHeight: number;
}

export interface RenderedRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BoundingBox {
    start: Point;
    end: Point;
}

export type Handle = 'move' | 'rotate' | 'scale-tl' | 'scale-tr' | 'scale-bl' | 'scale-br';

export interface TransformState {
    action: Handle;
    initialAnnotations: Annotation[];
    startPoint: Point; // canvas coordinates
    pivot: Point; // canvas coordinates
    initialBox: { // canvas coordinates
        center: Point,
        width: number,
        height: number,
    };
    preserveAspectRatio?: boolean;
}

/**
 * Calculates the actual rendering dimensions and position of a video
 * inside a container, respecting 'object-fit: contain'.
 */
export const getRenderedRect = ({
    containerWidth,
    containerHeight,
    videoWidth,
    videoHeight,
}: VideoDimensions): RenderedRect => {
    const videoAspectRatio = videoWidth / videoHeight;
    const containerAspectRatio = containerWidth / containerHeight;

    let renderedWidth = containerWidth;
    let renderedHeight = containerHeight;
    
    if (containerAspectRatio > videoAspectRatio) {
        renderedWidth = containerHeight * videoAspectRatio;
    } else {
        renderedHeight = containerWidth / videoAspectRatio;
    }

    const x = (containerWidth - renderedWidth) / 2;
    const y = (containerHeight - renderedHeight) / 2;
    
    return { x, y, width: renderedWidth, height: renderedHeight };
};

/**
 * Converts canvas pixel coordinates to normalized [0, 1] coordinates.
 */
// FIX: Changed return type from `Point | null` to `Point` as it never returns null.
export const canvasToNormalized = (canvasPoint: Point, renderedRect: RenderedRect): Point => {
    // Clamp to the rendered rect bounds before normalizing
    const clampedX = Math.max(renderedRect.x, Math.min(canvasPoint.x, renderedRect.x + renderedRect.width));
    const clampedY = Math.max(renderedRect.y, Math.min(canvasPoint.y, renderedRect.y + renderedRect.height));

    const x = (clampedX - renderedRect.x) / renderedRect.width;
    const y = (clampedY - renderedRect.y) / renderedRect.height;
    
    return { x, y };
};

/**
 * Converts normalized [0, 1] coordinates to canvas pixel coordinates.
 */
export const normalizedToCanvas = (normalizedPoint: Point, renderedRect: RenderedRect): Point => {
    return {
        x: renderedRect.x + normalizedPoint.x * renderedRect.width,
        y: renderedRect.y + normalizedPoint.y * renderedRect.height,
    };
};

// --- New Transformation and Selection Helpers ---

const rotatePoint = (point: Point, center: Point, angle: number): Point => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
        x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
};

const getAnnotationPoints = (anno: Annotation, renderedRect: RenderedRect, videoToCanvasScaleY: number): Point[] => {
    switch (anno.type) {
        case AnnotationTool.IMAGE:
        case AnnotationTool.RECTANGLE:
        case AnnotationTool.ELLIPSE:
        case AnnotationTool.VIDEO: {
            const rectAnno = anno as RectangleAnnotation | EllipseAnnotation | ImageAnnotation | VideoAnnotation;
            const center = normalizedToCanvas(rectAnno.center, renderedRect);
            const width = rectAnno.width * renderedRect.width;
            const height = rectAnno.height * renderedRect.height;
            const halfW = width / 2;
            const halfH = height / 2;
            const corners = [
                { x: center.x - halfW, y: center.y - halfH }, // tl
                { x: center.x + halfW, y: center.y - halfH }, // tr
                { x: center.x + halfW, y: center.y + halfH }, // br
                { x: center.x - halfW, y: center.y + halfH }, // bl
            ];
            return corners.map(p => rotatePoint(p, center, rectAnno.rotation));
        }
        case AnnotationTool.ARROW:
            const arrowAnno = anno as ArrowAnnotation;
            return [normalizedToCanvas(arrowAnno.start, renderedRect), normalizedToCanvas(arrowAnno.end, renderedRect)];
        case AnnotationTool.FREEHAND:
            const freehandAnno = anno as FreehandAnnotation;
            return freehandAnno.points.map(p => normalizedToCanvas(p, renderedRect));
        case AnnotationTool.TEXT:
            const textAnno = anno as TextAnnotation;
            const pos = normalizedToCanvas(textAnno.position, renderedRect);
            const width = textAnno.text.length * textAnno.fontSize * 0.6; // Approximation
            const height = textAnno.fontSize * videoToCanvasScaleY; // Approximation
            return [
                pos,
                { x: pos.x + width, y: pos.y },
                { x: pos.x + width, y: pos.y + height },
                { x: pos.x, y: pos.y + height },
            ];
    }
    return [];
}

const getAxisAlignedBoundingBox = (points: Point[]): BoundingBox | null => {
    if (points.length === 0) return null;
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }
    return { start: { x: minX, y: minY }, end: { x: maxX, y: maxY } };
};

const getCombinedBoundingBox = (annotations: Annotation[], renderedRect: RenderedRect, videoToCanvasScaleY: number): BoundingBox | null => {
    const allPoints = annotations.flatMap(a => getAnnotationPoints(a, renderedRect, videoToCanvasScaleY));
    return getAxisAlignedBoundingBox(allPoints);
};

export const getAnnotationBoundingBox = (annotation: Annotation, renderedRect: RenderedRect, videoToCanvasScaleY: number): BoundingBox | null => {
    return getAxisAlignedBoundingBox(getAnnotationPoints(annotation, renderedRect, videoToCanvasScaleY));
};

export const getAnnotationsBoundingBox = (annotations: Annotation[], renderedRect: RenderedRect, videoToCanvasScaleY: number): BoundingBox | null => {
    return getCombinedBoundingBox(annotations, renderedRect, videoToCanvasScaleY);
};

const HANDLE_SIZE = 8;
const getTransformHandles = (box: BoundingBox) => {
    const { start, end } = box;
    const width = end.x - start.x;
    const height = end.y - start.y;
    return {
        'scale-tl': { x: start.x - HANDLE_SIZE / 2, y: start.y - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE },
        'scale-tr': { x: end.x - HANDLE_SIZE / 2, y: start.y - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE },
        'scale-bl': { x: start.x - HANDLE_SIZE / 2, y: end.y - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE },
        'scale-br': { x: end.x - HANDLE_SIZE / 2, y: end.y - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE },
        'rotate': { x: start.x + width / 2 - HANDLE_SIZE / 2, y: start.y - 25 - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE },
    };
}

export const drawSelection = (ctx: CanvasRenderingContext2D, annotations: Annotation[], renderedRect: RenderedRect) => {
    const videoToCanvasScaleY = renderedRect.height > 0 ? renderedRect.height / renderedRect.height : 1;
    const box = getCombinedBoundingBox(annotations, renderedRect, videoToCanvasScaleY);
    if (!box) return;

    // Draw main bounding box
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(box.start.x, box.start.y, box.end.x - box.start.x, box.end.y - box.start.y);
    ctx.setLineDash([]);

    // Draw handles
    const handles = getTransformHandles(box);
    ctx.fillStyle = 'rgba(0, 255, 255, 0.9)';

    // Rotation line and handle
    const rotHandle = handles['rotate'];
    const boxCenter = { x: box.start.x + (box.end.x - box.start.x) / 2, y: box.start.y };
    ctx.beginPath();
    ctx.moveTo(boxCenter.x, boxCenter.y);
    ctx.lineTo(rotHandle.x + HANDLE_SIZE / 2, rotHandle.y + HANDLE_SIZE / 2);
    ctx.stroke();
    ctx.fillRect(rotHandle.x, rotHandle.y, rotHandle.width, rotHandle.height);
    
    // Scale handles
    Object.values(handles).forEach(h => {
        if (h !== rotHandle) ctx.fillRect(h.x, h.y, h.width, h.height);
    });
};

const isPointInRect = (point: Point, rect: { x: number, y: number, width: number, height: number }) => {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export const getHandleUnderPoint = (point: Point, annotations: Annotation[], renderedRect: RenderedRect): Handle | null => {
    const videoToCanvasScaleY = renderedRect.height > 0 ? renderedRect.height / renderedRect.height : 1;
    const box = getCombinedBoundingBox(annotations, renderedRect, videoToCanvasScaleY);
    if (!box) return null;
    const handles = getTransformHandles(box);
    for (const [name, rect] of Object.entries(handles)) {
        if (isPointInRect(point, rect)) return name as Handle;
    }
    if (isPointInRect(point, { x: box.start.x, y: box.start.y, width: box.end.x - box.start.x, height: box.end.y - box.start.y })) {
        return 'move';
    }
    return null;
}

function distSq(p1: Point, p2: Point) {
    return Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
}

function distanceToLineSegmentSquared(point: Point, start: Point, end: Point): number {
    const l2 = distSq(start, end);
    if (l2 === 0) return distSq(point, start);
    let t = ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const closestPoint = {
        x: start.x + t * (end.x - start.x),
        y: start.y + t * (end.y - start.y)
    };
    return distSq(point, closestPoint);
}


export const isPointInAnnotation = (point: Point, anno: Annotation, renderedRect: RenderedRect, videoToCanvasScaleY: number): boolean => {
    const canvasPoint = normalizedToCanvas(point, renderedRect);

    switch (anno.type) {
        case AnnotationTool.IMAGE:
        case AnnotationTool.RECTANGLE:
        case AnnotationTool.VIDEO: {
            const rectAnno = anno as RectangleAnnotation | ImageAnnotation | VideoAnnotation;
            const center = normalizedToCanvas(rectAnno.center, renderedRect);
            const width = rectAnno.width * renderedRect.width;
            const height = rectAnno.height * renderedRect.height;
            
            const unrotatedPoint = rotatePoint(canvasPoint, center, -rectAnno.rotation);

            const halfWidth = Math.abs(width / 2);
            const halfHeight = Math.abs(height / 2);
            return unrotatedPoint.x >= center.x - halfWidth &&
                   unrotatedPoint.x <= center.x + halfWidth &&
                   unrotatedPoint.y >= center.y - halfHeight &&
                   unrotatedPoint.y <= center.y + halfHeight;
        }
        case AnnotationTool.ELLIPSE: {
            const ellipseAnno = anno as EllipseAnnotation;
            const center = normalizedToCanvas(ellipseAnno.center, renderedRect);
            const radiusX = (ellipseAnno.width * renderedRect.width) / 2;
            const radiusY = (ellipseAnno.height * renderedRect.height) / 2;

            if (Math.abs(radiusX) < 1 || Math.abs(radiusY) < 1) return false;
            
            const unrotatedPoint = rotatePoint(canvasPoint, center, -ellipseAnno.rotation);
            
            const p = Math.pow(unrotatedPoint.x - center.x, 2) / Math.pow(radiusX, 2) +
                      Math.pow(unrotatedPoint.y - center.y, 2) / Math.pow(radiusY, 2);
            return p <= 1;
        }
        case AnnotationTool.ARROW: {
            const arrowAnno = anno as ArrowAnnotation;
            const start = normalizedToCanvas(arrowAnno.start, renderedRect);
            const end = normalizedToCanvas(arrowAnno.end, renderedRect);
            const tolerance = Math.max(5, (anno.lineWidth || 1));
            return distanceToLineSegmentSquared(canvasPoint, start, end) <= tolerance * tolerance;
        }
        case AnnotationTool.FREEHAND: {
            const freehandAnno = anno as FreehandAnnotation;
            if (freehandAnno.points.length < 2) return false;
            const canvasPoints = freehandAnno.points.map(p => normalizedToCanvas(p, renderedRect));
            const tolerance = Math.max(5, (anno.lineWidth || 1));

            for (let i = 0; i < canvasPoints.length - 1; i++) {
                if (distanceToLineSegmentSquared(canvasPoint, canvasPoints[i], canvasPoints[i + 1]) <= tolerance * tolerance) {
                    return true;
                }
            }
            return false;
        }
        case AnnotationTool.TEXT: {
            const textAnno = anno as TextAnnotation;
            const pos = normalizedToCanvas(textAnno.position, renderedRect);
            const width = textAnno.text.length * textAnno.fontSize * 0.6; // Approximation
            const height = textAnno.fontSize * videoToCanvasScaleY; // Approximation
            return canvasPoint.x >= pos.x && canvasPoint.x <= pos.x + width &&
                   canvasPoint.y >= pos.y && canvasPoint.y <= pos.y + height;
        }
        default:
            return false;
    }
}


export const isAnnotationInMarquee = (anno: Annotation, marquee: BoundingBox, renderedRect: RenderedRect, videoToCanvasScaleY: number): boolean => {
    const annoBox = getAxisAlignedBoundingBox(getAnnotationPoints(anno, renderedRect, videoToCanvasScaleY));
    if(!annoBox) return false;
    const marqueeCanvas = {
        start: normalizedToCanvas(marquee.start, renderedRect),
        end: normalizedToCanvas(marquee.end, renderedRect)
    };
    const marqueeStartX = Math.min(marqueeCanvas.start.x, marqueeCanvas.end.x);
    const marqueeStartY = Math.min(marqueeCanvas.start.y, marqueeCanvas.end.y);
    const marqueeEndX = Math.max(marqueeCanvas.start.x, marqueeCanvas.end.x);
    const marqueeEndY = Math.max(marqueeCanvas.start.y, marqueeCanvas.end.y);

    return annoBox.start.x < marqueeEndX && annoBox.end.x > marqueeStartX &&
           annoBox.start.y < marqueeEndY && annoBox.end.y > marqueeStartY;
};


export const startTransform = (
    action: Handle,
    startPoint: Point,
    annotations: Annotation[],
    renderedRect: RenderedRect,
    options: { preserveAspectRatio?: boolean } = {},
): TransformState => {
    const videoToCanvasScaleY = renderedRect.height > 0 ? renderedRect.height / renderedRect.height : 1;
    const initialBoxCanvas = getCombinedBoundingBox(annotations, renderedRect, videoToCanvasScaleY)!;
    return {
        action,
        initialAnnotations: JSON.parse(JSON.stringify(annotations)), // Deep copy
        startPoint,
        pivot: {
            x: initialBoxCanvas.start.x + (initialBoxCanvas.end.x - initialBoxCanvas.start.x) / 2,
            y: initialBoxCanvas.start.y + (initialBoxCanvas.end.y - initialBoxCanvas.start.y) / 2,
        },
        initialBox: {
            center: {x: initialBoxCanvas.start.x + (initialBoxCanvas.end.x - initialBoxCanvas.start.x) / 2, y: initialBoxCanvas.start.y + (initialBoxCanvas.end.y - initialBoxCanvas.start.y) / 2},
            width: initialBoxCanvas.end.x - initialBoxCanvas.start.x,
            height: initialBoxCanvas.end.y - initialBoxCanvas.start.y,
        },
        preserveAspectRatio: Boolean(options.preserveAspectRatio),
    };
};

export const applyTransform = (currentPoint: Point, state: TransformState, renderedRect: RenderedRect): Annotation[] => {
    const dx = (currentPoint.x - state.startPoint.x) / renderedRect.width;
    const dy = (currentPoint.y - state.startPoint.y) / renderedRect.height;
    
    switch (state.action) {
        case 'move':
            return state.initialAnnotations.map(anno => {
                const newAnno = { ...anno };
                switch (newAnno.type) {
                    case AnnotationTool.IMAGE:
                    case AnnotationTool.RECTANGLE:
                    case AnnotationTool.ELLIPSE:
                    case AnnotationTool.VIDEO:
                        (newAnno as ImageAnnotation | RectangleAnnotation | EllipseAnnotation | VideoAnnotation).center = { x: (newAnno as any).center.x + dx, y: (newAnno as any).center.y + dy };
                        break;
                    case AnnotationTool.ARROW:
                        newAnno.start = { x: newAnno.start.x + dx, y: newAnno.start.y + dy };
                        newAnno.end = { x: newAnno.end.x + dx, y: newAnno.end.y + dy };
                        break;
                    case AnnotationTool.FREEHAND:
                        newAnno.points = newAnno.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                        break;
                    case AnnotationTool.TEXT:
                        newAnno.position = { x: newAnno.position.x + dx, y: newAnno.position.y + dy };
                        break;
                }
                return newAnno;
            });
        
        case 'rotate': {
            const startAngle = Math.atan2(state.startPoint.y - state.pivot.y, state.startPoint.x - state.pivot.x);
            const currentAngle = Math.atan2(currentPoint.y - state.pivot.y, currentPoint.x - state.pivot.x);
            const angleDelta = currentAngle - startAngle;

            return state.initialAnnotations.map(anno => {
                const newAnno = { ...anno };
                switch (newAnno.type) {
                    case AnnotationTool.IMAGE:
                    case AnnotationTool.RECTANGLE:
                    case AnnotationTool.ELLIPSE:
                    case AnnotationTool.VIDEO:
                        const typedAnno = newAnno as ImageAnnotation | RectangleAnnotation | EllipseAnnotation | VideoAnnotation;
                        typedAnno.rotation = (typedAnno.rotation || 0) + angleDelta;
                        const initialCenter = normalizedToCanvas(typedAnno.center, renderedRect);
                        const rotatedCenter = rotatePoint(initialCenter, state.pivot, angleDelta);
                        typedAnno.center = canvasToNormalized(rotatedCenter, renderedRect);
                        break;
                    case AnnotationTool.ARROW: {
                        const initialStart = normalizedToCanvas(newAnno.start, renderedRect);
                        const rotatedStart = rotatePoint(initialStart, state.pivot, angleDelta);
                        newAnno.start = canvasToNormalized(rotatedStart, renderedRect);

                        const initialEnd = normalizedToCanvas(newAnno.end, renderedRect);
                        const rotatedEnd = rotatePoint(initialEnd, state.pivot, angleDelta);
                        newAnno.end = canvasToNormalized(rotatedEnd, renderedRect);
                        break;
                    }
                    case AnnotationTool.FREEHAND: {
                        newAnno.points = newAnno.points.map(p => {
                            const initialPoint = normalizedToCanvas(p, renderedRect);
                            const rotatedPoint = rotatePoint(initialPoint, state.pivot, angleDelta);
                            return canvasToNormalized(rotatedPoint, renderedRect);
                        });
                        break;
                    }
                    case AnnotationTool.TEXT: {
                         const initialPos = normalizedToCanvas(newAnno.position, renderedRect);
                         const rotatedPos = rotatePoint(initialPos, state.pivot, angleDelta);
                         newAnno.position = canvasToNormalized(rotatedPos, renderedRect);
                         break;
                    }
                }
                return newAnno;
            });
        }
        
        case 'scale-br':
        case 'scale-bl':
        case 'scale-tr':
        case 'scale-tl':
            {
                const originalDx = state.startPoint.x - state.pivot.x;
                const originalDy = state.startPoint.y - state.pivot.y;
                const currentDx = currentPoint.x - state.pivot.x;
                const currentDy = currentPoint.y - state.pivot.y;
                
                let scaleX = originalDx ? currentDx / originalDx : 1;
                let scaleY = originalDy ? currentDy / originalDy : 1;

                if (state.preserveAspectRatio) {
                    const uniform = Math.max(Math.abs(scaleX), Math.abs(scaleY));
                    const signX = scaleX < 0 ? -1 : 1;
                    const signY = scaleY < 0 ? -1 : 1;
                    scaleX = uniform * signX;
                    scaleY = uniform * signY;
                }

                return state.initialAnnotations.map(anno => {
                    const newAnno = { ...anno };
                    switch (newAnno.type) {
                        case AnnotationTool.IMAGE:
                        case AnnotationTool.RECTANGLE:
                        case AnnotationTool.ELLIPSE:
                        case AnnotationTool.VIDEO:
                            const typedAnno = newAnno as ImageAnnotation | RectangleAnnotation | EllipseAnnotation | VideoAnnotation;
                            typedAnno.width *= Math.abs(scaleX);
                            typedAnno.height *= Math.abs(scaleY);
                            const newCenterX = state.pivot.x + (normalizedToCanvas(typedAnno.center, renderedRect).x - state.pivot.x) * scaleX;
                            const newCenterY = state.pivot.y + (normalizedToCanvas(typedAnno.center, renderedRect).y - state.pivot.y) * scaleY;
                            typedAnno.center = canvasToNormalized({x: newCenterX, y: newCenterY}, renderedRect);
                            break;
                        case AnnotationTool.ARROW: {
                            const initialStart = normalizedToCanvas(newAnno.start, renderedRect);
                            const newStartX = state.pivot.x + (initialStart.x - state.pivot.x) * scaleX;
                            const newStartY = state.pivot.y + (initialStart.y - state.pivot.y) * scaleY;
                            newAnno.start = canvasToNormalized({ x: newStartX, y: newStartY }, renderedRect);
                            
                            const initialEnd = normalizedToCanvas(newAnno.end, renderedRect);
                            const newEndX = state.pivot.x + (initialEnd.x - state.pivot.x) * scaleX;
                            const newEndY = state.pivot.y + (initialEnd.y - state.pivot.y) * scaleY;
                            newAnno.end = canvasToNormalized({ x: newEndX, y: newEndY }, renderedRect);
                            break;
                        }
                        case AnnotationTool.FREEHAND: {
                            newAnno.points = newAnno.points.map(p => {
                                const initialPoint = normalizedToCanvas(p, renderedRect);
                                const newPointX = state.pivot.x + (initialPoint.x - state.pivot.x) * scaleX;
                                const newPointY = state.pivot.y + (initialPoint.y - state.pivot.y) * scaleY;
                                return canvasToNormalized({ x: newPointX, y: newPointY }, renderedRect);
                            });
                            break;
                        }
                        case AnnotationTool.TEXT: {
                            const initialPos = normalizedToCanvas(newAnno.position, renderedRect);
                            const newPosX = state.pivot.x + (initialPos.x - state.pivot.x) * scaleX;
                            const newPosY = state.pivot.y + (initialPos.y - state.pivot.y) * scaleY;
                            newAnno.position = canvasToNormalized({ x: newPosX, y: newPosY }, renderedRect);
                            newAnno.fontSize *= Math.abs(scaleY);
                            break;
                        }
                    }
                    return newAnno;
                });
            }
    }
    return state.initialAnnotations;
};

export const getCommentMarkerUnderPoint = (point: Point, comments: Comment[], currentFrame: number, renderedRect: RenderedRect): Comment | null => {
    const commentsOnFrame = comments.filter(c => c.frame === currentFrame && c.position);
    for (const comment of commentsOnFrame) {
        if (!comment.position) continue;
        const markerPos = normalizedToCanvas(comment.position, renderedRect);
        const distanceSq = Math.pow(point.x - markerPos.x, 2) + Math.pow(point.y - markerPos.y, 2);
        const radius = 14; // Use slightly larger radius for easier clicking
        if (distanceSq <= radius * radius) {
            return comment;
        }
    }
    return null;
}

export const getTextAreaStyles = (position: Point, fontSize: number, renderedRect: RenderedRect, color: string) => {
    const canvasPos = normalizedToCanvas(position, renderedRect);
    return {
        left: `${canvasPos.x}px`,
        top: `${canvasPos.y}px`,
        fontSize: `${fontSize}px`,
        lineHeight: 1.2,
        color,
        fontFamily: 'sans-serif',
        width: '200px', // Start with a default width, JS will resize
        height: `${fontSize * 1.2}px`,
    };
}
