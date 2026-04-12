"use client";

import { useState } from "react";
import { ArrowLeft, Workflow, Plus, Settings, Play, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ComfyUIProviderManager } from "@/components/comfyui/provider-manager";
import { WorkflowManager } from "@/components/comfyui/workflow-manager";
import { LanguageSwitcher } from "@/components/language-switcher";
import { toast } from "sonner";

interface ComfyUIProviderConfig {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isEnabled: boolean;
}

interface Workflow {
  id: string;
  name: string;
  workflowJson: string;
}

type Tab = "workflows" | "settings";

export default function ComfyUIWorkflowsPage() {
  const t = useTranslations("comfyui");
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("workflows");
  const [selectedProvider, setSelectedProvider] = useState<ComfyUIProviderConfig | null>(null);
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);

  async function handleRunWorkflow(workflow: Workflow) {
    if (!selectedProvider?.id) {
      toast.error(t("noProvider"));
      setActiveTab("settings");
      return;
    }

    setRunningWorkflowId(workflow.id);

    try {
      // 解析工作流 JSON
      const workflowJson =
        typeof workflow.workflowJson === "string"
          ? JSON.parse(workflow.workflowJson)
          : workflow.workflowJson;

      // 提取第一个 KSampler 节点的 prompt
      let promptText = "";
      for (const [nodeId, nodeData] of Object.entries(workflowJson)) {
        if (
          typeof nodeData === "object" &&
          nodeData !== null &&
          "class_type" in nodeData &&
          (nodeData as { class_type: string }).class_type === "CLIPTextEncode"
        ) {
          const node = nodeData as unknown as { inputs?: { text?: string } };
          if (node.inputs?.text) {
            promptText = node.inputs.text;
            break;
          }
        }
      }

      // 调用运行 API
      const res = await fetch("/api/comfyui/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: workflow.id,
          inputParams: { prompt: promptText },
        }),
      });

      if (!res.ok) {
        throw new Error(t("runWorkflow"));
      }

      const data = await res.json();
      toast.success(t("running"));

      // 轮询状态（示例，实际可以跳转到状态页面）
      pollStatus(data.generationId);
    } catch (error) {
      toast.error(t("status.failed"));
      console.error(error);
    } finally {
      setRunningWorkflowId(null);
    }
  }

  async function pollStatus(generationId: string) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        const res = await fetch(`/api/comfyui/status/${generationId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "completed") {
            toast.success(t("status.completed"));
            return;
          }
          if (data.status === "failed") {
            toast.error(`${t("status.failed")}: ${data.error}`);
            return;
          }
        }
      } catch (error) {
        console.error("Poll error:", error);
      }
    }
    toast.warning(t("running"));
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 flex-shrink-0 items-center justify-between border-b border-[--border-subtle] bg-white/80 backdrop-blur-xl px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[--text-muted] transition-colors hover:bg-[--surface] hover:text-[--text-primary]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Workflow className="h-3.5 w-3.5" />
            </div>
            <span className="font-display text-sm font-semibold text-[--text-primary]">
              {t("title")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedProvider && (
            <div className="hidden sm:flex items-center gap-2 mr-2 px-2.5 py-1 rounded-lg bg-primary/5 border border-primary/10">
              <span className="text-xs text-primary font-medium">{selectedProvider.name}</span>
              <span className="text-[10px] text-primary/60">{selectedProvider.baseUrl}</span>
            </div>
          )}
          <LanguageSwitcher />
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-[--border-subtle] bg-white/50 px-4 lg:px-6">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("workflows")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
              activeTab === "workflows"
                ? "border-primary text-primary"
                : "border-transparent text-[--text-muted] hover:text-[--text-primary]"
            }`}
          >
            <Workflow className="h-4 w-4" />
            {t("workflows")}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
              activeTab === "settings"
                ? "border-primary text-primary"
                : "border-transparent text-[--text-muted] hover:text-[--text-primary]"
            }`}
          >
            <Settings className="h-4 w-4" />
            {t("providers")}
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 bg-[--surface] p-4 lg:p-6">
        <div className="mx-auto max-w-5xl animate-page-in">
          {activeTab === "workflows" ? (
            <div className="space-y-4">
              {/* Provider Selector */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">{t("selectProvider")}</h3>
                  <Button size="sm" variant="ghost" onClick={() => setActiveTab("settings")}>
                    <Settings className="h-3.5 w-3.5" />
                    {t("providers")}
                  </Button>
                </div>
                <ComfyUIProviderManager
                  selectedProviderId={selectedProvider?.id}
                  onProviderSelect={setSelectedProvider}
                />
              </Card>

              {/* Workflow Manager */}
              <Card className="p-4">
                <WorkflowManager
                  providerId={selectedProvider?.id}
                  onRunWorkflow={handleRunWorkflow}
                />
              </Card>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="p-4">
                <ComfyUIProviderManager
                  selectedProviderId={selectedProvider?.id}
                  onProviderSelect={(provider) => {
                    setSelectedProvider(provider);
                    setActiveTab("workflows");
                  }}
                />
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
