const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash"
];

const SYSTEM_INSTRUCTION = `তুমি "SYED AI", একজন বাংলা স্টাডি ও কনসেপ্ট হেল্পার। ইউজার যখন কোনো কঠিন পড়াশোনার টপিক বা প্রশ্ন দেবে, তখন সবসময় নিচের ৪টি নির্দিষ্ট অংশে নির্ভুল, সংক্ষিপ্ত, সহজ ও সাবলীল বাংলায় উত্তর দেবে:

১. মূল ধারণা (coreConcept): টপিকটি কী তা ১-২ সংক্ষিপ্ত লাইনে পরিষ্কারভাবে বলো।
২. সহজ ব্যাখ্যা (simpleExplanation): দৈনন্দিন জীবনের ১টি পরিচিত উদাহরণ দিয়ে ধাপে ধাপে সংক্ষিপ্ত ও সহজ বাংলায় বুঝিয়ে দাও।
৩. সাধারণ ভুল (commonMistakes): শিক্ষার্থীরা কোথায় সবচেয়ে বেশি ভুল করে তা ৩টি ছোট পয়েন্টে দেখাও।
৪. দ্রুত রিভিশন (quickRevision): পরীক্ষার আগে মনে রাখার মতো ৩টি সংক্ষিপ্ত মূল পয়েন্ট দাও।

বানান ও ভাষা নিয়ে কড়া নিয়ম:
- শুদ্ধ ও প্রমিত বাংলা বানান ব্যবহার করবে।
- "শিরা" কে কখনো "শিরাজ" লিখবে না; "প্রতিটি" লিখবে ("প্রতিটা" নয়)।
- অপ্রয়োজনীয় লম্বা বর্ণনা এড়িয়ে চলো এবং কঠিন ইংরেজি পরিভাষা থাকলে বাংলায় অর্থসহ ব্র্যাকেটে লেখো।`;

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      if (!env.GEMINI_API_KEY) {
        throw new Error("সার্ভারে GEMINI_API_KEY সেট করা নেই।");
      }

      const body = await request.json().catch(() => ({}));
      const topic = (body.topic || "").trim();

      if (!topic) {
        return new Response(JSON.stringify({ error: "টপিক বা প্রশ্ন প্রয়োজন।" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (topic.length > 500) {
        return new Response(JSON.stringify({ error: "প্রশ্নটি অনেক বড় (সর্বোচ্চ ৫০০ অক্ষর)।" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const payload = {
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: `টপিক/প্রশ্ন: ${topic}` }]
          }
        ],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              coreConcept: { type: "STRING" },
              simpleExplanation: { type: "STRING" },
              commonMistakes: { type: "ARRAY", items: { type: "STRING" } },
              quickRevision: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["coreConcept", "simpleExplanation", "commonMistakes", "quickRevision"]
          }
        }
      };

      let parsedData = null;
      let lastError = null;

      for (const model of MODELS) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err = new Error(data?.error?.message || `HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }

          const rawText =
            data?.candidates?.[0]?.content?.parts
              ?.map((p) => p.text || "")
              .join("") || "";

          const cleaned = rawText
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/i, "")
            .trim();

          parsedData = JSON.parse(cleaned);
          break;
        } catch (err) {
          lastError = err;
          if (err.status === 404) continue;
          throw err;
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (!parsedData) {
        throw lastError || new Error("মডেল থেকে উত্তর পাওয়া যায়নি।");
      }

      return new Response(JSON.stringify(parsedData), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || "সার্ভার এরর হয়েছে।" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
  }
};
