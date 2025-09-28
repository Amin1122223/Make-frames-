import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Type } from "@google/genai";

const App = () => {
    // --- State Management ---
    const [prompt, setPrompt] = useState('');
    const [style, setStyle] = useState('شعلة شونين');
    const [numFrames, setNumFrames] = useState(3);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // --- Examples ---
    const examples = [
        { 
            name: "مبارزة ساموراي", 
            prompt: "ساموراي يسحب سيف الكاتانا الخاص به بسرعة البرق استعدادًا لمواجهة خصمه تحت ضوء القمر.",
            style: "أكشن سينمائي" 
        },
        { 
            name: "فتاة ساحرة", 
            prompt: "فتاة ساحرة صغيرة تطير على مكنستها فوق مدينة متلألئة في الليل، وشعرها يتدفق خلفها.",
            style: "سحر الاستوديو" 
        },
        { 
            name: "روبوت مستقبلي", 
            prompt: "روبوت ضخم يمشي عبر شوارع طوكيو الماطرة المضاءة بالنيون، والبخار يتصاعد من مفاصله.",
            style: "مستقبل سيبراني" 
        },
    ];

    const handleExampleClick = (ex: typeof examples[0]) => {
        setPrompt(ex.prompt);
        setStyle(ex.style);
        setUploadedImage(null);
        setSuggestedPrompts([]);
    };
    
    // --- Image Analysis for Suggestions ---
    const analyzeImage = async (imageDataUrl: string) => {
        setIsAnalyzing(true);
        setSuggestedPrompts([]);
        setError(null);

        try {
            const [header, base64Data] = imageDataUrl.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
            
            const imagePart = {
                inlineData: { mimeType, data: base64Data },
            };

            const analysisPrompt = {
                text: `
                    حلل إطار الأنمي الرئيسي (genga) هذا.
                    اقترح 3 تعديلات أو حركات تالية محتملة لوصف الإطار التالي في التسلسل.
                    يجب أن تكون الاقتراحات قصيرة ومناسبة كمطالبات للذكاء الاصطناعي.
                    مثال: "يرفع سيفه أعلى", "يأخذ خطوة للوراء", "تتوهج عيناه بغضب".
                    أجب باللغة العربية فقط.
                `
            };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, analysisPrompt] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            suggestions: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING, description: "اقتراح حركة تالية" }
                            }
                        }
                    }
                }
            });

            const jsonResponse = JSON.parse(response.text);
            if (jsonResponse.suggestions && Array.isArray(jsonResponse.suggestions)) {
                setSuggestedPrompts(jsonResponse.suggestions);
            }

        } catch (e) {
            console.error("Analysis failed:", e);
            setError("فشل تحليل الصورة. يمكنك كتابة وصفك الخاص.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    // --- Image Handling ---
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const imageDataUrl = reader.result as string;
                setUploadedImage(imageDataUrl);
                analyzeImage(imageDataUrl); 
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveImage = () => {
        setUploadedImage(null);
        setSuggestedPrompts([]);
    };


    // --- Frame Generation Logic ---
    const generateFrames = async () => {
        if (!prompt) {
            setError("يرجى إدخال وصف للمشهد أو التعديل المطلوب.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedImages([]);

        try {
            if (uploadedImage) {
                // Image-to-Image Generation (Modification)
                const [header, base64Data] = uploadedImage.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';

                const imagePart = {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                  },
                };

                const textPrompt = `
                    ارسم إطار الأنمي الرئيسي (genga) التالي في التسلسل بناءً على الصورة والوصف.
                    الأسلوب: ${style}.
                    التعديل المطلوب: ${prompt}.
                    يجب أن يكون الرسم الناتج بخطوط نظيفة كتكملة مباشرة للصورة المدخلة.
                `;
                
                const textPart = { text: textPrompt };
            
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image-preview',
                    contents: {
                        parts: [imagePart, textPart],
                    },
                    config: {
                        responseModalities: [Modality.IMAGE, Modality.TEXT],
                    },
                });

                const newImages: string[] = [];
                if (response.candidates && response.candidates.length > 0) {
                    for (const part of response.candidates[0].content.parts) {
                        if (part.inlineData) {
                            const base64ImageBytes = part.inlineData.data;
                            newImages.push(`data:image/png;base64,${base64ImageBytes}`);
                        }
                    }
                }

                if (newImages.length > 0) {
                    setGeneratedImages(newImages);
                } else {
                    setError("لم يتمكن الذكاء الاصطناعي من تعديل الصورة. حاول بوصف مختلف.");
                }

            } else {
                // Text-to-Image Generation
                const fullPrompt = `
                    أنشئ ${numFrames} إطارات رسوم متحركة رئيسية متسلسلة (genga) لمشهد أنمي.
                    الأسلوب: ${style}.
                    وصف المشهد: ${prompt}.
                    يجب أن يُظهر كل إطار تقدمًا واضحًا في الحركة. يجب أن يكون الرسم بخطوط نظيفة ومناسب لإنتاج الرسوم المتحركة. لا تقم بتضمين أي أرقام أو نصوص على الصور نفسها.
                `;

                const response = await ai.models.generateImages({
                    model: 'imagen-4.0-generate-001',
                    prompt: fullPrompt,
                    config: {
                      numberOfImages: numFrames,
                      outputMimeType: 'image/jpeg',
                      aspectRatio: '16:9',
                    },
                });

                if (response.generatedImages && response.generatedImages.length > 0) {
                    const imageUrls = response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
                    setGeneratedImages(imageUrls);
                } else {
                    setError("لم يتمكن الذكاء الاصطناعي من إنشاء الصور. يرجى المحاولة مرة أخرى بطلب مختلف.");
                }
            }
        } catch (e) {
            console.error(e);
            setError("حدث خطأ أثناء الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col lg:flex-row p-4 sm:p-6 lg:p-8 gap-8">
            {/* --- Controls Column --- */}
            <aside className="lg:w-1/3 xl:w-1/4 flex flex-col gap-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-700">
                <header>
                    <h1 className="text-3xl font-bold text-indigo-400">مولّد إطارات Genga</h1>
                    <p className="text-gray-400 mt-2">حوّل أفكارك إلى مشاهد أنمي رئيسية جاهزة للإنتاج.</p>
                </header>

                {/* --- Image Uploader --- */}
                <div className="flex flex-col gap-2">
                    <label className="font-bold text-gray-300">الإطار المرجعي (اختياري)</label>
                    {uploadedImage ? (
                        <div className="relative group">
                            <img src={uploadedImage} alt="Preview" className="rounded-lg w-full object-contain border-2 border-indigo-500" />
                            <button 
                                onClick={handleRemoveImage}
                                className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100"
                                aria-label="إزالة الصورة"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    ) : (
                        <label htmlFor="image-upload" className="cursor-pointer bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:border-indigo-500 hover:bg-gray-700 transition">
                            <i className="fas fa-upload text-4xl text-gray-500 mb-2"></i>
                            <span className="text-gray-400">اسحب وأفلت صورة هنا</span>
                            <span className="text-sm text-gray-500">أو انقر للرفع</span>
                            <input id="image-upload" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </label>
                    )}
                </div>


                <div className="flex flex-col gap-2">
                    <label htmlFor="scene-desc" className="font-bold text-gray-300">
                        {uploadedImage ? "صف التعديل التالي" : "وصف المشهد"}
                    </label>
                    <textarea
                        id="scene-desc"
                        rows={uploadedImage ? 4 : 6}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={uploadedImage ? "مثال: يرفع سيفه استعداداً للهجوم..." : "مثال: مبارز يصد هجوم تنين ناري..."}
                        className="bg-gray-800 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 resize-none"
                        aria-label="وصف المشهد أو التعديل"
                    />
                </div>

                {/* --- Suggested Prompts --- */}
                <div className="mt-2">
                    {isAnalyzing && (
                        <div className="flex items-center gap-2 text-gray-400">
                            <i className="fas fa-spinner fa-spin"></i>
                            <span>جاري تحليل الإطار...</span>
                        </div>
                    )}
                    {!isAnalyzing && suggestedPrompts.length > 0 && (
                        <div>
                            <h3 className="font-bold text-gray-300 mb-2 text-sm">مطالبات مقترحة:</h3>
                            <div className="flex flex-wrap gap-2">
                                {suggestedPrompts.map((suggestion, index) => (
                                    <button 
                                        key={index} 
                                        onClick={() => setPrompt(suggestion)}
                                        className="bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 py-1 px-3 rounded-full transition"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <label htmlFor="style-select" className="font-bold text-gray-300">اختر الأسلوب الفني</label>
                    <select
                        id="style-select"
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                        className="bg-gray-800 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
                        aria-label="اختر الأسلوب الفني"
                    >
                        <option>شعلة شونين</option>
                        <option>رقة شوجو</option>
                        <option>سحر الاستوديو</option>
                        <option>مستقبل سيبراني</option>
                        <option>أكشن سينمائي</option>
                        <option>رعب قوطي</option>
                    </select>
                </div>
                
                <div className="flex flex-col gap-2">
                    <label htmlFor="num-frames" className={`font-bold text-gray-300 ${uploadedImage ? 'text-gray-500' : ''}`}>
                         {uploadedImage ? "عدد الإطارات (1 عند التعديل)" : `عدد الإطارات الرئيسية (${numFrames})`}
                    </label>
                    <input
                        id="num-frames"
                        type="range"
                        min="1"
                        max="5"
                        value={uploadedImage ? 1 : numFrames}
                        onChange={(e) => setNumFrames(parseInt(e.target.value, 10))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="عدد الإطارات الرئيسية"
                        disabled={!!uploadedImage}
                    />
                </div>

                <button
                    onClick={generateFrames}
                    disabled={isLoading || isAnalyzing}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200 text-lg flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <i className="fas fa-spinner fa-spin"></i>
                            <span>جاري الرسم...</span>
                        </>
                    ) : (
                        <>
                           <i className={`fas ${uploadedImage ? 'fa-wand-magic-sparkles' : 'fa-magic-sparkles'}`}></i>
                           <span>{uploadedImage ? "عدّل المشهد" : "ولّد الإطارات"}</span>
                        </>
                    )}
                </button>
                
                <div className="border-t border-gray-700 pt-4">
                     <h3 className="font-bold text-gray-300 mb-2">أو جرب أحد الأمثلة:</h3>
                     <div className="flex flex-wrap gap-2">
                        {examples.map(ex => (
                            <button key={ex.name} onClick={() => handleExampleClick(ex)} className="bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 py-1 px-3 rounded-full transition">
                                {ex.name}
                            </button>
                        ))}
                     </div>
                </div>
            </aside>

            {/* --- Output Column --- */}
            <main className="flex-1 flex flex-col items-center justify-center bg-gray-900/50 p-6 rounded-2xl border border-gray-700 min-h-[50vh] lg:min-h-0">
                {error && <div className="text-red-400 bg-red-900/50 border border-red-700 p-4 rounded-lg">{error}</div>}
                
                {isLoading && (
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="loader"></div>
                        <h2 className="text-2xl font-bold text-indigo-400">جاري رسم المستقبل...</h2>
                        <p className="text-gray-400">قد يستغرق الأمر بضع لحظات. يقوم فنان الذكاء الاصطناعي لدينا بتجهيز فرشه.</p>
                    </div>
                )}

                {!isLoading && generatedImages.length === 0 && !error && (
                    <div className="text-center text-gray-500">
                        <i className="far fa-image text-6xl mb-4"></i>
                        <h2 className="text-2xl font-semibold">ستظهر إطاراتك الرئيسية هنا</h2>
                        <p className="mt-2">صف المشهد الذي تتخيله، اختر أسلوبك، ودع السحر يبدأ.</p>
                    </div>
                )}
                
                {generatedImages.length > 0 && (
                    <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-min overflow-y-auto">
                        {generatedImages.map((src, index) => (
                            <div key={index} className="genga-frame rounded-lg shadow-lg">
                                <img src={src} alt={`إطار genga رقم ${index + 1}`} className="w-full h-full object-contain" />
                                <div className="genga-number">
                                    原画 #{index + 1}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
