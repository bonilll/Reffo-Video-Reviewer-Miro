"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Flag, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

interface ReportAssetDialogProps {
  assetId: Id<"assets">;
}

const reportTypes = [
  { value: "inappropriate_content", label: "Inappropriate Content" },
  { value: "copyright_violation", label: "Copyright Violation" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "violence", label: "Violence" },
  { value: "adult_content", label: "Adult Content" },
  { value: "fake_content", label: "Fake Content" },
  { value: "other", label: "Other" },
];

export function ReportAssetDialog({ assetId }: ReportAssetDialogProps) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reportAsset = useMutation(api.reports.reportAsset);

  const handleSubmit = async () => {
    if (!reportType) {
      toast.error("Please select a report type");
      return;
    }

    setIsSubmitting(true);
    try {
      await reportAsset({
        assetId,
        reportType: reportType as any,
        description: description.trim() || undefined,
      });

      toast.success("Report submitted successfully. The image has been hidden pending review.");
      setOpen(false);
      setReportType("");
      setDescription("");
    } catch (error: any) {
      if (error.message.includes("already reported")) {
        toast.error("You have already reported this image");
      } else {
        toast.error("Failed to submit report. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
        >
          <Flag className="h-4 w-4 mr-2" />
          Report Image
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Report Image
          </DialogTitle>
          <DialogDescription>
            Help us keep the community safe by reporting inappropriate content.
            The image will be hidden immediately pending review.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason for reporting</label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Additional details (optional)
            </label>
            <Textarea
              placeholder="Provide any additional context about why you're reporting this image..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !reportType}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              "Submit Report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 