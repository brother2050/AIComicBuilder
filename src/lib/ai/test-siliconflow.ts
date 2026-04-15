import { SiliconFlowProvider } from "./providers/siliconflow";

async function testSiliconFlowProvider() {
  console.log("Testing SiliconFlow Provider...\n");

  const provider = new SiliconFlowProvider({
    apiKey: process.env.SILICONFLOW_API_KEY,
    baseURL: process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1",
    model: process.env.SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V3",
    uploadDir: "./uploads",
  });

  try {
    console.log("1. Testing text generation...");
    const textResult = await provider.generateText("Hello, please introduce yourself in one sentence.");
    console.log("✓ Text generation successful:", textResult);
  } catch (error: any) {
    console.error("✗ Text generation failed:", error?.message || error);
  }

  try {
    console.log("\n2. Testing text generation with system prompt...");
    const textWithSystem = await provider.generateText(
      "What is 2+2?",
      {
        systemPrompt: "You are a helpful math assistant. Keep answers brief.",
        temperature: 0.3,
      }
    );
    console.log("✓ Text with system prompt successful:", textWithSystem);
  } catch (error: any) {
    console.error("✗ Text with system prompt failed:", error?.message || error);
  }

  try {
    console.log("\n3. Testing image generation...");
    const imageResult = await provider.generateImage(
      "A beautiful sunset over mountains",
      {
        aspectRatio: "16:9",
      }
    );
    console.log("✓ Image generation successful:", imageResult);
  } catch (error: any) {
    console.error("✗ Image generation failed:", error?.message || error);
  }

  console.log("\nTest completed.");
}

if (require.main === module) {
  testSiliconFlowProvider().catch(console.error);
}

export { testSiliconFlowProvider };