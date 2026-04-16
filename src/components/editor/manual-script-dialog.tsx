"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Loader2 } from "lucide-react";
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
import { createLogger } from "@/lib/logger";

const logger = createLogger("manual-script-dialog");

interface ManualScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (script: string) => void;
}

export function ManualScriptDialog({
  open,
  onOpenChange,
  onComplete,
}: ManualScriptDialogProps) {
  const t = useTranslations("manualScript");
  const tc = useTranslations("common");

  const [script, setScript] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!script.trim()) {
      toast.error(t("emptyScript"));
      return;
    }

    setSaving(true);
    try {
      onComplete(script);
      onOpenChange(false);
      toast.success(t("success"));
    } catch (err) {
      logger.error("Manual script error:", err);
      toast.error(tc("generationFailed"));
    } finally {
      setSaving(false);
    }
  }

  function resetState() {
    setScript("");
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
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={t("placeholder")}
            rows={20}
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
          <Button onClick={handleSubmit} disabled={!script.trim() || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {t("saving")}
              </>
            ) : (
              <>
                <FileText className="mr-1.5 h-4 w-4" />
                {t("confirm")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}