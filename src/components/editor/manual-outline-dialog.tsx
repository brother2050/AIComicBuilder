"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ListOrdered, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ManualOutlineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (outline: string) => void;
}

export function ManualOutlineDialog({
  open,
  onOpenChange,
  onComplete,
}: ManualOutlineDialogProps) {
  const t = useTranslations("manualOutline");
  const tc = useTranslations("common");

  const [outline, setOutline] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!outline.trim()) {
      toast.error(t("emptyOutline"));
      return;
    }

    setSaving(true);
    try {
      onComplete(outline);
      onOpenChange(false);
      toast.success(t("success"));
    } catch (err) {
      console.error("Manual outline error:", err);
      toast.error(tc("generationFailed"));
    } finally {
      setSaving(false);
    }
  }

  function resetState() {
    setOutline("");
    setSaving(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Textarea
            value={outline}
            onChange={(e) => setOutline(e.target.value)}
            placeholder={t("placeholder")}
            rows={15}
            className="resize-none font-mono text-sm"
          />
          <p className="text-xs text-[--text-muted]">
            {t("hint")}
          </p>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {tc("cancel")}
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!outline.trim() || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {t("saving")}
              </>
            ) : (
              <>
                <ListOrdered className="mr-1.5 h-4 w-4" />
                {t("confirm")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}