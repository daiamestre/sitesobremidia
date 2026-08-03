import { aiService, AIResponse } from './ai.service';

export class CopilotService {
  async askQuestion(question: string, empresaOperadoraId?: string): Promise<AIResponse> {
    return aiService.askExecutiveCopilot(question, empresaOperadoraId);
  }
}

export const copilotService = new CopilotService();
