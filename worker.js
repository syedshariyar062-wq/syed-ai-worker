const MODELS = [
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite"
];

function buildSystemInstruction(level, mode) {
  let modeInstruction = "";

  if (mode === "Concise") {
    modeInstruction =
      "ব্যবহারকারী 'সংক্ষিপ্ত' মোড বেছে নিয়েছে। মূল তথ্য সংক্ষিপ্ত ও পরিষ্কার রাখো, তবে ব্যবহারকারী যদি নির্দিষ্ট করে বড় বা বিস্তারিত কিছু চায়, তাহলে তার চাহিদা অনুযায়ী উত্তর দাও।";
  } else if (mode === "Full Chapter") {
    modeInstruction =
      "ব্যবহারকারী 'Full Chapter' মোড বেছে নিয়েছে। পুরো অধ্যায়ের সব গুরুত্বপূর্ণ অংশ, সংজ্ঞা, সূত্র/ধাপ, উদাহরণ ও পরীক্ষার নোট বিস্তারিত ও পূর্ণাঙ্গভাবে লেখো। কোনোভাবেই ছোট সারাংশ দিয়ে শেষ করবে না।";
  } else {
    modeInstruction =
      "ব্যবহারকারী 'Full Topic' মোড বেছে নিয়েছে। টপিকটির মূল ধারণা, ধাপ, উদাহরণ ও প্রয়োগসহ পূর্ণাঙ্গ ও বিস্তারিত ব্যাখ্যা দাও।";
  }

  return `তুমি "SYED AI", একজন সাহায্যকারী একাডেমিক ও সাধারণ প্রশ্নোত্তর সহকারী।
ব্যবহারকারীর স্তর: ${level}।
${modeInstruction}

মূল নিয়ম:
১. ব্যবহারকারী তার প্রশ্ন বা লেখায় যেভাবে, যে দৈর্ঘ্যে বা যে স্টাইলে উত্তর চাইবে, যথাসম্ভব সেই অনুযায়ী উত্তর দাও।
২. প্রয়োজনীয় বাস্তব তথ্য, সাম্প্রতিক আপডেট বা রেফারেন্সের জন্য গুগল সার্চ টুল ব্যবহার করো।
৩. উত্তর নিচের ৫টি ফিল্ডে JSON আকারে দেবে:
   - coreConcept: মূল ধারণা ও সংজ্ঞা (বিস্তারিত বা সংক্ষিপ্ত—মোড ও ব্যবহারকারীর চাহিদা অনুযায়ী)
   - simpleExplanation: ধাপে ধাপে বিস্তারিত ব্যাখ্যা ও উদাহরণ
   - visualDiagram: প্রবাহ বা সম্পর্ক বোঝাতে ASCII ডায়াগ্রাম / ফ্লোচার্ট
   - commonMistakes: সাধারণ ভুলের পয়েন্টগুলো
   - quickRevision: দ্রুত রিভিশনের মূল পয়েন্টগুলো
৪. শুদ্ধ ও প্রমিত বাংলা বানান ব্যবহার করবে। "শিরা" কে "শিরাজ" লিখবে না এবং "প্রতিটা" না লিখে "প্রতিটি" লিখবে।`;
}

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
      const rawTopic = String(body.rawTopic || body.topic || "").trim();
      const level = String(body.level || "College / HSC").trim();
      const mode = String(body.mode || "Full Topic").trim();

      if (!rawTopic) {
        return new Response(JSON.stringify({ error: "টপিক বা প্রশ্ন প্রয়োজন।" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (rawTopic.length > 1500) {
        return new Response(JSON.stringify({ error: "প্রশ্নটি অনেক বড় (সর্বোচ্চ ১৫০০ অক্ষর)।" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const systemInstruction = buildSystemInstruction(level, mode);
      const userPrompt = `স্তর: ${level}\nমোড: ${mode}\nব্যবহারকারীর প্রশ্ন/নির্দেশনা: ${rawTopic}`;

      const payload = {
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        tools: [{ google_search: {} }],
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: mode === "Full Chapter" ? 8192 : mode === "Full Topic" ? 4096 : 2048,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              coreConcept: { type: "STRING" },
              simpleExplanation: { type: "STRING" },
              visualDiagram: { type: "STRING" },
              commonMistakes: { type: "ARRAY", items: { type: "STRING" } },
              quickRevision: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: [
              "coreConcept",
              "simpleExplanation",
              "visualDiagram",
              "commonMistakes",
              "quickRevision"
            ]
          }
        }
      };

      let parsedData = null;
      let lastError = null;
      let activeModel = "";

      for (const model of MODELS) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

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
          activeModel = model;
          break;
        } catch (err) {
          lastError = err;
          if (err.status === 404 || err.status === 503 || err.status === 429) continue;
          throw err;
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (!parsedData) {
        throw lastError || new Error("মডেল থেকে উত্তর পাওয়া যায়নি।");
      }

      return new Response(
        JSON.stringify({
          ...parsedData,
          _meta: { model: activeModel, mode, level }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
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
