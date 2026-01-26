import React, { memo, useEffect, useMemo, useState } from "react";
import { FileText, Download, File as FileIcon, Code, Database, FileImage, FileVideo, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileLayer } from "@/types/canvas";

interface FileProps {
  id: string;
  layer: FileLayer;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  selectionColor?: string;
}

const getFileIcon = (fileType?: string, fileName?: string) => {
  if (!fileType && !fileName) return FileIcon;
  
  const type = fileType || fileName?.split('.').pop()?.toLowerCase() || '';
  
  switch (type) {
    case 'json':
      return Database;
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'html':
    case 'css':
    case 'scss':
    case 'xml':
      return Code;
    case 'txt':
    case 'md':
    case 'readme':
      return FileText;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
      return FileImage;
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'wmv':
    case 'flv':
    case 'webm':
      return FileVideo;
    default:
      return FileIcon;
  }
};

const getFileTypeLabel = (fileType?: string, fileName?: string) => {
  if (!fileType && !fileName) return 'FILE';
  
  const type = fileType || fileName?.split('.').pop()?.toLowerCase() || '';
  
  switch (type) {
    case 'json':
      return 'JSON';
    case 'js':
    case 'jsx':
      return 'JS';
    case 'ts':
    case 'tsx':
      return 'TS';
    case 'html':
      return 'HTML';
    case 'css':
    case 'scss':
      return 'CSS';
    case 'xml':
      return 'XML';
    case 'txt':
      return 'TXT';
    case 'md':
      return 'MD';
    case 'pdf':
      return 'PDF';
    default:
      return type.toUpperCase();
  }
};

const getFileColor = (fileType?: string, fileName?: string) => {
  if (!fileType && !fileName) return '#6B7280';
  
  const type = fileType || fileName?.split('.').pop()?.toLowerCase() || '';
  
  switch (type) {
    case 'json':
      return '#10B981'; // Emerald green - più moderno e professionale
    case 'js':
    case 'jsx':
      return '#F7DF1E'; // JavaScript yellow
    case 'ts':
    case 'tsx':
      return '#3178C6'; // TypeScript blue
    case 'html':
      return '#E34F26'; // HTML orange
    case 'css':
    case 'scss':
      return '#1572B6'; // CSS blue
    case 'xml':
      return '#FF6600'; // XML orange
    case 'txt':
    case 'md':
      return '#6B7280'; // Gray
    case 'pdf':
      return '#DC2626'; // Red
    default:
      return '#6B7280'; // Default gray
  }
};

const getFileExtension = (fileType?: string, fileName?: string) => {
  if (fileType && fileType.includes("/")) {
    return fileType.split("/").pop()?.toLowerCase() || "";
  }
  if (fileType) return fileType.toLowerCase();
  if (fileName && fileName.includes(".")) {
    return fileName.split(".").pop()!.toLowerCase();
  }
  return "";
};

const PREVIEW_TEXT_EXTENSIONS = new Set([
  "json",
  "txt",
  "md",
  "csv",
  "log",
  "xml",
  "yaml",
  "yml",
]);

const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_TEXT_PREVIEW_CHARS = 1200;

export const File = memo(({ id, layer, onPointerDown, selectionColor }: FileProps) => {
  const { width, height, title, fileName, fileType, fileSize } = layer;
  
  const IconComponent = getFileIcon(fileType, fileName);
  const typeLabel = getFileTypeLabel(fileType, fileName);
  const fileColor = getFileColor(fileType, fileName);
  const fileExtension = useMemo(() => getFileExtension(fileType, fileName), [fileType, fileName]);
  const isPdf = fileExtension === "pdf";
  const isTextPreviewable = PREVIEW_TEXT_EXTENSIONS.has(fileExtension);
  const canPreviewText = isTextPreviewable && (!fileSize || fileSize <= MAX_TEXT_PREVIEW_BYTES);

  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);
  const [textPreviewError, setTextPreviewError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  const formatFileSize = (size?: number) => {
    if (!size) return '';
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  };

  useEffect(() => {
    if (!isPreviewOpen || !canPreviewText || !layer.url) return;
    let isMounted = true;
    const controller = new AbortController();

    const loadPreview = async () => {
      setTextPreviewLoading(true);
      setTextPreviewError(null);
      try {
        const response = await fetch(layer.url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const raw = await response.text();
        let preview = raw.trim();
        if (fileExtension === "json") {
          try {
            preview = JSON.stringify(JSON.parse(preview), null, 2);
          } catch {
            // Keep raw preview if parsing fails
          }
        }
        if (preview.length > MAX_TEXT_PREVIEW_CHARS) {
          preview = `${preview.slice(0, MAX_TEXT_PREVIEW_CHARS)}…`;
        }
        if (isMounted) {
          setTextPreview(preview);
        }
      } catch (error) {
        if (isMounted) {
          setTextPreviewError("Preview unavailable");
        }
      } finally {
        if (isMounted) {
          setTextPreviewLoading(false);
        }
      }
    };

    loadPreview();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [canPreviewText, fileExtension, isPreviewOpen, layer.url]);

  useEffect(() => {
    if (!isPreviewOpen) {
      setIsFullScreen(false);
    }
  }, [isPreviewOpen]);

  return (
    <div
      className="relative bg-white rounded-xl border-2 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden group"
      onPointerDown={(e) => onPointerDown(e, id)}
      style={{
        width: width,
        height: height,
        borderColor: selectionColor || '#E5E7EB',
        borderWidth: selectionColor ? 2 : 1,
      }}
    >
      {/* Header con gradient background */}
      <div 
        className="relative h-16 flex items-center justify-between px-4 py-3"
        style={{
          background: `linear-gradient(135deg, ${fileColor}15 0%, ${fileColor}08 100%)`
        }}
      >
        {/* File Icon */}
        <div className="flex items-center space-x-3">
          <div 
            className="p-2.5 rounded-lg shadow-sm"
            style={{ 
              backgroundColor: fileColor + '20',
              border: `1px solid ${fileColor}30`
            }}
          >
            <IconComponent 
              size={20} 
              style={{ color: fileColor }}
            />
          </div>
          
          {/* Type Badge */}
          <div 
            className="px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: fileColor }}
          >
            {typeLabel}
          </div>
        </div>

        {/* Download indicator */}
        <div className="opacity-40 group-hover:opacity-70 transition-opacity">
          <Download size={14} className="text-gray-600" />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 pt-2">
        {/* File Name */}
        <div className="text-sm font-semibold text-gray-900 truncate mb-1">
          {title || fileName || 'Untitled File'}
        </div>
        
        {/* File Size */}
        {fileSize && (
          <div className="text-xs text-gray-500 font-medium">
            {formatFileSize(fileSize)}
          </div>
        )}
      </div>

      {/* Bottom decorative line */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${fileColor}40 0%, ${fileColor}20 50%, ${fileColor}40 100%)`
        }}
      />
      {/* Preview button */}
      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="flex items-center gap-1 rounded-md bg-white/90 border border-gray-200 px-2 py-1 text-[11px] text-gray-600 shadow-sm hover:text-gray-900 hover:border-gray-300"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setIsPreviewOpen(true);
          }}
        >
          <ExternalLink className="h-3 w-3" />
          Preview
        </button>
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent
          className={
            isFullScreen
              ? "w-[98vw] h-[96vh] max-w-[98vw] p-0 overflow-hidden flex flex-col"
              : "w-[92vw] max-w-5xl h-[84vh] p-0 overflow-hidden flex flex-col"
          }
        >
          <DialogHeader className="px-6 pt-4 pb-2 border-b border-gray-100">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {title || fileName || "File preview"}
            </DialogTitle>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{typeLabel}</span>
              {fileSize && <span>{formatFileSize(fileSize)}</span>}
              {layer.url && (
                <a
                  href={layer.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Download className="h-3 w-3" />
                  Open
                </a>
              )}
            </div>
            <div className="absolute right-14 top-4">
              <button
                className="rounded-md border border-gray-200 bg-white/90 px-2 py-1 text-xs text-gray-600 shadow-sm hover:text-gray-900 hover:border-gray-300"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsFullScreen((prev) => !prev);
                }}
              >
                {isFullScreen ? (
                  <span className="inline-flex items-center gap-1">
                    <Minimize2 className="h-3 w-3" /> Exit full screen
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Maximize2 className="h-3 w-3" /> Full screen
                  </span>
                )}
              </button>
            </div>
          </DialogHeader>

          <div className="px-6 pb-5 pt-3 flex-1 overflow-hidden">
            <div className="h-full rounded-xl border border-gray-200 bg-white overflow-hidden">
              {isPdf && (
                <object
                  data={layer.url}
                  type="application/pdf"
                  className="w-full h-full"
                  aria-label="PDF preview"
                >
                  <div className="p-6 text-sm text-gray-500">PDF preview not supported.</div>
                </object>
              )}

              {!isPdf && canPreviewText && (
                <div className="h-full overflow-auto bg-gray-50/70 p-4">
                  {textPreviewLoading && (
                    <div className="text-sm text-gray-500">Loading preview...</div>
                  )}
                  {!textPreviewLoading && textPreviewError && (
                    <div className="text-sm text-gray-500">{textPreviewError}</div>
                  )}
                  {!textPreviewLoading && !textPreviewError && (
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                      {textPreview}
                    </pre>
                  )}
                </div>
              )}

              {!isPdf && !canPreviewText && (
                <div className="h-full flex items-center justify-center text-sm text-gray-500">
                  No preview available for this file.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

File.displayName = "File";
