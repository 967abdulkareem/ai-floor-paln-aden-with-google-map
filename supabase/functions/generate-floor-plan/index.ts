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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { prompt } = await req.json();
    if (!prompt) {
      throw new Error("No prompt provided");
    }

    console.log("[generate-floor-plan] Calling Lovable AI with prompt length:", prompt.length);

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-pro-image-preview",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Please add funds to your workspace." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("[generate-floor-plan] AI gateway error:", response.status, errText);
      throw new Error("AI gateway error: " + errText);
    }

    const data = await response.json();
    console.log("[generate-floor-plan] Response received, processing...");

    // Extract image and text from the response
    const message = data.choices?.[0]?.message;
    let imageBase64: string | null = null;
    let textResponse: string | null = null;

    if (message?.content) {
      // Check if content is an array (multimodal response)
      if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === "image_url" && part.image_url?.url) {
            imageBase64 = part.image_url.url;
          } else if (part.type === "text") {
            textResponse = part.text;
          }
        }
      } else if (typeof message.content === "string") {
        // Check if the string contains a base64 image
        const base64Match = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (base64Match) {
          imageBase64 = base64Match[0];
        }
        textResponse = message.content;
      }
    }

    // Also check for inline_data format
    if (!imageBase64 && message?.content) {
      const parts = Array.isArray(message.content) ? message.content : [];
      for (const part of parts) {
        if (part.inline_data?.mime_type?.startsWith("image/")) {
          imageBase64 = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
        }
      }
    }

    console.log("[generate-floor-plan] Image found:", !!imageBase64, "Text found:", !!textResponse);

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
