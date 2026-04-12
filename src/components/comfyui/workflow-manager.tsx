"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Upload,
  Download,
  Play,
  MoreVertical,
  Image,
  Video,
  Settings,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

interface Workflow {
  id: string;
  name: string;
  description: string;
  workflowJson: string;
  providerId: string;
  workflowType: "image" | "video" | "custom";
  isDefault: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowManagerProps {
  providerId?: string;
  onRunWorkflow?: (workflow: Workflow) => void;
}

export function WorkflowManager({ providerId, onRunWorkflow }: WorkflowManagerProps) {
  const t = useTranslations("comfyui");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    workflowJson: "",
    workflowType: "custom" as "image" | "video" | "custom",
  });
  const [importJson, setImportJson] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载 workflows
  useEffect(() => {
    fetchWorkflows();
  }, []);

  async function fetchWorkflows() {
    try {
      const res = await fetch("/api/comfyui/workflows");
      if (res.ok) {
        const data = await res.json();
        const filtered = providerId
          ? data.workflows.filter((w: Workflow) => w.providerId === providerId)
          : data.workflows;
        setWorkflows(filtered);
      }
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    // 新建时必须选择 provider
    const effectiveProviderId = providerId || editingWorkflow?.providerId;
    if (!effectiveProviderId) {
      toast.error(t("selectProviderFirst", "Please select a ComfyUI provider first"));
      return;
    }

    try {
      const url = editingWorkflow
        ? `/api/comfyui/workflows/${editingWorkflow.id}`
        : "/api/comfyui/workflows";
      const method = editingWorkflow ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          providerId: effectiveProviderId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save");
      }

      toast.success(t("saveSuccess"));
      setShowDialog(false);
      setEditingWorkflow(null);
      fetchWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("deleteWorkflowConfirm", { name: "" }))) return;

    try {
      const res = await fetch(`/api/comfyui/workflows/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");

      toast.success(t("deleteSuccess"));
      setSelectedWorkflow(null);
      fetchWorkflows();
    } catch {
      toast.error(t("deleteSuccess"));
    }
  }

  async function handleImport() {
    try {
      const parsed = JSON.parse(importJson);
      setFormData({
        name: parsed.name || t("importWorkflow"),
        description: parsed.description || "",
        workflowJson: importJson,
        workflowType: "custom",
      });
      setShowImportDialog(false);
      setImportJson("");
      setEditingWorkflow(null);
      setShowDialog(true);
    } catch {
      toast.error(t("invalidJson"));
    }
  }

  function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        JSON.parse(content);
        setImportJson(content);
        toast.success(t("importSuccess"));
      } catch {
        toast.error(t("invalidJson"));
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function handleExport(workflow: Workflow) {
    try {
      const dataStr = JSON.stringify(JSON.parse(workflow.workflowJson), null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workflow.name.replace(/\s+/g, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("exportSuccess"));
    } catch {
      toast.error(t("exportSuccess"));
    }
  }

  function handleDuplicate(workflow: Workflow) {
    setFormData({
      name: `${workflow.name} (Copy)`,
      description: workflow.description,
      workflowJson: workflow.workflowJson,
      workflowType: workflow.workflowType,
    });
    setEditingWorkflow(null);
    setShowDialog(true);
  }

  function openCreateDialog() {
    setFormData({
      name: "",
      description: "",
      workflowJson: JSON.stringify(
        {
          "3": { inputs: { text: "", clip: [["4", 0]] }, class_type: "CLIPTextEncode" },
          "4": { inputs: { budget: { model_name: "sd15" } }, class_type: "CheckpointLoaderSimple" },
          "5": { inputs: { width: 512, height: 512, batch_size: 1 }, class_type: "EmptyLatentImage" },
          "6": { inputs: { positive: [["3", 0]], negative: "", latent_image: [["5", 0]] }, class_type: "KSampler" },
          "7": { inputs: { samples: [["6", 0]], model: [["4", 0]] }, class_type: "VAEDecode" },
          "8": { inputs: { filename_prefix: "output", images: [["7", 0]] }, class_type: "SaveImage" },
        },
        null,
        2
      ),
      workflowType: "custom",
    });
    setEditingWorkflow(null);
    setShowDialog(true);
  }

  function openEditDialog(workflow: Workflow) {
    setFormData({
      name: workflow.name,
      description: workflow.description,
      workflowJson: workflow.workflowJson,
      workflowType: workflow.workflowType,
    });
    setEditingWorkflow(workflow);
    setShowDialog(true);
  }

  function handleRun(workflow: Workflow) {
    onRunWorkflow?.(workflow);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success(t("copy") || "Copied");
  }

  const typeIcons = {
    image: <Image className="h-3.5 w-3.5" />,
    video: <Video className="h-3.5 w-3.5" />,
    custom: <Settings className="h-3.5 w-3.5" />,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{t("workflows")}</h3>
          <p className="text-xs text-muted-foreground">{t("noWorkflowsHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-3.5 w-3.5" />
            {t("importWorkflow")}
          </Button>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-3.5 w-3.5" />
            {t("newWorkflow")}
          </Button>
        </div>
      </div>

      {/* Workflow Grid */}
      {workflows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-8 border-dashed">
          <Workflow className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{t("noWorkflows")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("noWorkflowsHint")}
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="h-3.5 w-3.5" />
              {t("importWorkflow")}
            </Button>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5" />
              {t("newWorkflow")}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {workflows.map((workflow) => (
            <Card
              key={workflow.id}
              className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                selectedWorkflow?.id === workflow.id
                  ? "ring-2 ring-primary/20 bg-primary/5"
                  : ""
              }`}
              onClick={() => setSelectedWorkflow(workflow)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {typeIcons[workflow.workflowType]}
                    <span className="ml-1">{t(`workflowTypes.${workflow.workflowType}`)}</span>
                  </Badge>
                  {workflow.isDefault && (
                    <Badge variant="default" className="text-xs px-1.5 py-0">
                      {t("defaultWorkflow")}
                    </Badge>
                  )}
                </div>
                <div className="relative group">
                  <button className="p-1 rounded hover:bg-muted">
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block">
                    <Card className="p-1 min-w-[120px] shadow-lg">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRun(workflow);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted"
                      >
                        <Play className="h-3 w-3" />
                        {t("runWorkflow")}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(workflow);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted"
                      >
                        <Pencil className="h-3 w-3" />
                        {t("editWorkflow")}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(workflow);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted"
                      >
                        <Copy className="h-3 w-3" />
                        {t("duplicateWorkflow")}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExport(workflow);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted"
                      >
                        <Download className="h-3 w-3" />
                        {t("exportWorkflow")}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(workflow.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-destructive/10 text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                        {t("deleteWorkflow")}
                      </button>
                    </Card>
                  </div>
                </div>
              </div>
              <h4 className="text-sm font-medium truncate">{workflow.name}</h4>
              {workflow.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {workflow.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{t("usageCount")}: {workflow.usageCount}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Selected Workflow Details */}
      {selectedWorkflow && (
        <Card className="p-4 mt-4">
          <h4 className="text-sm font-medium mb-2">{t("workflows")}</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("workflowName")}:</span>
              <span>{selectedWorkflow.name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("workflowType")}:</span>
              <Badge variant="outline" className="text-xs">
                {t(`workflowTypes.${selectedWorkflow.workflowType}`)}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("createdAt")}:</span>
              <span>{new Date(selectedWorkflow.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t">
            <Button size="sm" className="w-full" onClick={() => handleRun(selectedWorkflow)}>
              <Play className="h-3.5 w-3.5" />
              {t("runWorkflow")}
            </Button>
          </div>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingWorkflow ? t("editWorkflow") : t("newWorkflow")}
            </DialogTitle>
            <DialogDescription>
              {t("workflowDescriptionPlaceholder")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2">
            <div className="space-y-1.5">
              <Label>{t("workflowName")}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("workflowNamePlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("workflowDescription")}</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t("workflowDescriptionPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("workflowType")}</Label>
              <select
                value={formData.workflowType}
                onChange={(e) =>
                  setFormData({ ...formData, workflowType: e.target.value as "image" | "video" | "custom" })
                }
                className="w-full h-9 px-3 rounded-lg border border-border bg-transparent text-sm outline-none hover:bg-[--surface-hover] hover:border-[--border-hover] focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
              >
                <option value="image">{t("workflowTypes.image")}</option>
                <option value="video">{t("workflowTypes.video")}</option>
                <option value="custom">{t("workflowTypes.custom")}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>JSON</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(formData.workflowJson)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <Textarea
                value={formData.workflowJson}
                onChange={(e) => setFormData({ ...formData, workflowJson: e.target.value })}
                placeholder='{"nodes": [...], "links": [...]}'
                className="font-mono text-xs h-[200px] resize-none"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!formData.name || !formData.workflowJson}>
              {editingWorkflow ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("importWorkflow")}</DialogTitle>
            <DialogDescription>
              {t("workflowDescriptionPlaceholder")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileImport}
              />
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("dragDropHint")}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{t("supportedFormats")}</p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("or") || "or"}</span>
              </div>
            </div>

            <Textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"nodes": [...], "links": [...]}'
              className="font-mono text-xs h-[150px] resize-none"
            />
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleImport} disabled={!importJson.trim()}>
              <Upload className="h-3.5 w-3.5" />
              {t("importWorkflow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
