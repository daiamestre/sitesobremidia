import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, Bot, User, Loader2 } from 'lucide-react';
import { copilotService } from '../../services/copilot.service';

export function ExecutiveCopilotDashboard({ empresaOperadoraId }: { empresaOperadoraId?: string }) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { role: 'assistant', text: 'Olá! Sou o Copilot Executivo do SOBRE MÍDIA ERP v2.0. Como posso auxiliar suas decisões estratégicas hoje?' },
  ]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!prompt.trim()) return;
    const userMsg = prompt;
    setPrompt('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    const response = await copilotService.askQuestion(userMsg, empresaOperadoraId);
    setLoading(false);

    setMessages((prev) => [...prev, { role: 'assistant', text: response.answer }]);
  };

  return (
    <Card className="border border-purple-500/20 bg-slate-900/90 backdrop-blur-xl shadow-2xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400 animate-pulse" /> Copilot Executivo IA (Gemini Engine)
          </span>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Consultas inteligentes em tempo real sobre o Data Warehouse e BI.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4 text-xs">
        <div className="h-64 overflow-y-auto space-y-3 p-3 rounded-xl bg-slate-950/80 border border-white/5">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 h-fit">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={`p-3 rounded-2xl max-w-[85%] whitespace-pre-line leading-relaxed ${
                  m.role === 'user' ? 'bg-purple-600 text-white font-medium' : 'bg-slate-900 text-slate-200 border border-white/10'
                }`}
              >
                {m.text}
              </div>
              {m.role === 'user' && (
                <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 h-fit">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-purple-400 text-xs p-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando dados do Data Warehouse...
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pergunte ao Copilot (ex: Qual a previsão de faturamento para o próximo trimestre?)"
            className="flex-1 p-3 rounded-xl bg-slate-950 border border-white/10 text-white placeholder:text-slate-500 text-xs focus:outline-none focus:border-purple-500"
          />
          <Button disabled={loading} onClick={handleSend} className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-4">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
