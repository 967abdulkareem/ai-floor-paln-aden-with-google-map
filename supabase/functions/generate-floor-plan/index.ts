import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("gemini_3_pro_image_preview");
    if (!apiKey) {
      throw new Error("Gemini API key not configured");
    }

    const { prompt } = await req.json();
    if (!prompt) {
      throw new Error("No prompt provided");
    }

    console.log("[generate-floor-plan] Calling Gemini with prompt length:", prompt.length);

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error("[generate-floor-plan] Gemini error:", JSON.stringify(err));
      throw new Error(err.error?.message || "Gemini API error");
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

    let imageBase64: string | null = null;
    let textResponse: string | null = null;

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith("image/")) {
        imageBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
      if (part.text) {
        textResponse = part.text;
      }
    }

    return new Response(
      JSON.stringify({ imageBase64, textResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-floor-plan] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
