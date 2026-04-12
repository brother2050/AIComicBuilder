"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Pencil, Trash2, TestTube, Eye, EyeOff, Check } from "lucide-react";
import { toast } from "sonner";

interface ComfyUIProviderConfig {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isEnabled: boolean;
  defaultWorkflowId?: string;
}

interface ComfyUIProviderManagerProps {
  onProviderSelect?: (provider: ComfyUIProviderConfig) => void;
  selectedProviderId?: string;
}

export function ComfyUIProviderManager({
  onProviderSelect,
  selectedProviderId,
}: ComfyUIProviderManagerProps) {
  const t = useTranslations("comfyui");
  const [providers, setProviders] = useState<ComfyUIProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ComfyUIProviderConfig | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<string | null>(null);
  const [formData, setFormData] = useState<ComfyUIProviderConfig>({
    name: "",
    baseUrl: "http://127.0.0.1:8188",
    apiKey: "",
    isEnabled: true,
  });

  // 加载 providers
  useEffect(() => {
    fetchProviders();
  }, []);

  async function fetchProviders() {
    try {
      const res = await fetch("/api/comfyui/providers");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      const url = editingProvider?.id
        ? `/api/comfyui/providers/${editingProvider.id}`
        : "/api/comfyui/providers";
      const method = editingProvider?.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error(t("saveSuccess"));
      }

      toast.success(t("saveSuccess"));
      setShowDialog(false);
      setEditingProvider(null);
      fetchProviders();
    } catch (error) {
      toast.error(t("saveSuccess"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("deleteProviderConfirm", { name: "" }))) return;

    try {
      const res = await fetch(`/api/comfyui/providers/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");

      toast.success(t("deleteSuccess"));
      fetchProviders();
    } catch {
      toast.error(t("deleteSuccess"));
    }
  }

  async function handleTest(provider: ComfyUIProviderConfig) {
    setTestingProviderId(provider.id!);
    try {
      // 使用代理 API 避免 CORS 问题
      const res = await fetch("/api/comfyui/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: provider.baseUrl,
          path: "/api/system_stats",
          headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
        }),
      });

      if (res.ok) {
        toast.success(t("connectionSuccess"));
      } else {
        toast.error(t("connectionFailed"));
      }
    } catch {
      toast.error(t("connectionFailed"));
    } finally {
      setTestingProviderId(null);
    }
  }

  function openCreateDialog() {
    setFormData({
      name: "",
      baseUrl: "http://127.0.0.1:8188",
      apiKey: "",
      isEnabled: true,
    });
    setEditingProvider(null);
    setShowDialog(true);
  }

  function openEditDialog(provider: ComfyUIProviderConfig) {
    setFormData(provider);
    setEditingProvider(provider);
    setShowDialog(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{t("providers")}</h3>
          <p className="text-xs text-muted-foreground">{t("baseUrlPlaceholder")}</p>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-3.5 w-3.5" />
          {t("newProvider")}
        </Button>
      </div>

      {providers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-8 border-dashed">
          <TestTube className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{t("noProviders")}</p>
          <Button size="sm" className="mt-3" onClick={openCreateDialog}>
            <Plus className="h-3.5 w-3.5" />
            {t("newProvider")}
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <Card
              key={provider.id}
              className={`p-3 cursor-pointer transition-all ${
                selectedProviderId === provider.id
                  ? "ring-2 ring-primary/20 bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
              onClick={() => onProviderSelect?.(provider)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      provider.isEnabled
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    CF
                  </div>
                  <div>
                    <p className="text-sm font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.baseUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {selectedProviderId === provider.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTest(provider);
                    }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                    disabled={testingProviderId === provider.id}
                  >
                    {testingProviderId === provider.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <TestTube className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditDialog(provider);
                    }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(provider.id!);
                    }}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Provider Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? t("editProvider") : t("newProvider")}
            </DialogTitle>
            <DialogDescription>
              {t("baseUrlPlaceholder")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("providerName")}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("providerNamePlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("baseUrl")}</Label>
              <Input
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder={t("baseUrlPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("apiKey")}</Label>
              <div className="relative">
                <Input
                  type={showApiKey === editingProvider?.id ? "text" : "password"}
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={t("apiKeyPlaceholder")}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowApiKey(showApiKey === editingProvider?.id ? null : editingProvider?.id || "")
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey === editingProvider?.id ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!formData.name || !formData.baseUrl}>
              {editingProvider ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
