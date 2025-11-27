/**
 * Tests for VehicleExpertAgent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VehicleExpertAgent } from '../../src/agents/vehicle-expert.agent';
import { ConversationContext, ConversationMode } from '../../src/types/conversation.types';

describe('VehicleExpertAgent', () => {
  let expert: VehicleExpertAgent;
  
  beforeEach(() => {
    expert = new VehicleExpertAgent();
  });
  
  const createContext = (overrides?: Partial<ConversationContext>): ConversationContext => ({
    conversationId: 'test-123',
    phoneNumber: '5511999999999',
    mode: 'discovery' as ConversationMode,
    profile: {},
    messages: [],
    metadata: {
      startedAt: new Date(),
      lastMessageAt: new Date(),
      messageCount: 0,
      extractionCount: 0,
      questionsAsked: 0,
      userQuestions: 0
    },
    ...overrides
  });
  
  describe('Question detection', () => {
    it('should detect user questions ending with ?', async () => {
      const context = createContext();
      const response = await expert.chat('Qual a diferença entre SUV e sedan?', context);
      
      expect(response.canRecommend).toBe(false);
      expect(response.response).toBeTruthy();
      expect(response.response.length).toBeGreaterThan(50); // Should be a detailed answer
    });
    
    it('should detect questions starting with question words', async () => {
      const context = createContext();
      const response = await expert.chat('Como funciona o financiamento?', context);
      
      expect(response.canRecommend).toBe(false);
      expect(response.response).toContain('financiamento');
    });
    
    it('should NOT treat regular answers as questions', async () => {
      const context = createContext({ 
        mode: 'clarification',
        metadata: {
          startedAt: new Date(),
          lastMessageAt: new Date(),
          messageCount: 2,
          extractionCount: 0,
          questionsAsked: 1,
          userQuestions: 0
        }
      });
      
      const response = await expert.chat('Até 50 mil', context);
      
      // Should extract preference and ask next question
      expect(response.extractedPreferences.budget).toBe(50000);
      expect(response.needsMoreInfo.length).toBeGreaterThan(0);
    });
  });
  
  describe('Preference extraction during chat', () => {
    it('should extract budget from natural response', async () => {
      const context = createContext();
      const response = await expert.chat('Tenho até 60 mil', context);
      
      expect(response.extractedPreferences.budget).toBe(60000);
      expect(response.canRecommend).toBe(false); // Not enough info yet
    });
    
    it('should extract multiple preferences at once', async () => {
      const context = createContext();
      const response = await expert.chat('Quero um SUV até 70 mil para 5 pessoas', context);
      
      expect(response.extractedPreferences.bodyType).toBe('suv');
      expect(response.extractedPreferences.budget).toBe(70000);
      expect(response.extractedPreferences.people).toBe(5);
    });
  });
  
  describe('Conversation flow', () => {
    it('should ask contextual questions when info is missing', async () => {
      const context = createContext({
        profile: { budget: 50000 }
      });
      
      const response = await expert.chat('Quero um carro', context);
      
      expect(response.canRecommend).toBe(false);
      expect(response.response).toMatch(/uso|cidade|viagem|pessoas/i);
      expect(response.needsMoreInfo.length).toBeGreaterThan(0);
    });
    
    it('should recommend when enough info is gathered', async () => {
      const context = createContext({
        profile: {
          budget: 50000,
          usage: 'cidade',
          people: 4
        },
        metadata: {
          startedAt: new Date(),
          lastMessageAt: new Date(),
          messageCount: 3,
          extractionCount: 3,
          questionsAsked: 2,
          userQuestions: 0
        }
      });
      
      const response = await expert.chat('Pode me mostrar os carros', context);
      
      expect(response.canRecommend).toBe(true);
      expect(response.recommendations).toBeDefined();
      expect(response.nextMode).toBe('recommendation');
    });
    
    it('should recommend after many messages even with partial info', async () => {
      const context = createContext({
        profile: {
          budget: 50000,
          usage: 'cidade'
          // Missing people
        },
        metadata: {
          startedAt: new Date(),
          lastMessageAt: new Date(),
          messageCount: 8, // Many messages
          extractionCount: 2,
          questionsAsked: 6,
          userQuestions: 0
        }
      });
      
      const response = await expert.chat('Ok, pode mostrar', context);
      
      // Should recommend to avoid infinite conversation
      expect(response.canRecommend).toBe(true);
    });
  });
  
  describe('Readiness assessment', () => {
    it('should require budget, usage, and people as minimum', async () => {
      const context = createContext({
        profile: {
          budget: 50000,
          usage: 'cidade',
          people: 4
        }
      });
      
      const response = await expert.chat('Vamos lá', context);
      expect(response.canRecommend).toBe(true);
    });
    
    it('should NOT recommend with only budget', async () => {
      const context = createContext({
        profile: { budget: 50000 },
        metadata: {
          startedAt: new Date(),
          lastMessageAt: new Date(),
          messageCount: 2,
          extractionCount: 1,
          questionsAsked: 1,
          userQuestions: 0
        }
      });
      
      const response = await expert.chat('Sim', context);
      expect(response.canRecommend).toBe(false);
      expect(response.needsMoreInfo).toContain('usage');
      expect(response.needsMoreInfo).toContain('people');
    });
  });
  
  describe('Answer generation', () => {
    it('should answer questions about vehicle categories', async () => {
      const context = createContext();
      const response = await expert.chat('Qual diferença entre SUV e sedan?', context);
      
      expect(response.response).toMatch(/SUV/i);
      expect(response.response).toMatch(/sedan/i);
      expect(response.response.length).toBeGreaterThan(100); // Detailed answer
    });
    
    it('should use inventory context in answers', async () => {
      const context = createContext({
        profile: { budget: 60000 }
      });
      
      const response = await expert.chat('Quais SUVs vocês têm?', context);
      
      // Should mention that we have SUVs in stock
      expect(response.response).toBeTruthy();
    });
  });
  
  describe('Recommendation formatting', () => {
    it('should format recommendations with match scores', async () => {
      const context = createContext({
        profile: {
          budget: 60000,
          usage: 'cidade',
          people: 4,
          bodyType: 'hatch'
        }
      });
      
      const response = await expert.chat('Me mostra', context);
      
      if (response.recommendations && response.recommendations.length > 0) {
        expect(response.response).toMatch(/R\$/); // Should show prices
        expect(response.response).toMatch(/\d+%/); // Should show match percentage
      }
    });
    
    it('should handle no results gracefully', async () => {
      const context = createContext({
        profile: {
          budget: 10000, // Very low budget
          usage: 'cidade',
          people: 8, // Many people
          bodyType: 'pickup', // Rare + expensive
          minYear: 2023 // Very new
        }
      });
      
      const response = await expert.chat('Me mostra', context);
      
      // Should offer to adjust criteria
      expect(response.response).toMatch(/ajustar|aumentar|considerar/i);
    });
  });
  
  describe('Context preservation', () => {
    it('should maintain conversation context', async () => {
      const context = createContext({
        profile: {
          budget: 50000,
          usage: 'viagem'
        },
        messages: [
          { role: 'user', content: 'Quero um carro para viagens', timestamp: new Date() },
          { role: 'assistant', content: 'Legal! Para viagens temos SUVs e sedans...', timestamp: new Date() }
        ],
        metadata: {
          startedAt: new Date(),
          lastMessageAt: new Date(),
          messageCount: 2,
          extractionCount: 1,
          questionsAsked: 1,
          userQuestions: 0
        }
      });
      
      const response = await expert.chat('Para 6 pessoas', context);
      
      // Should extract people and remember it's for travel
      expect(response.extractedPreferences.people).toBe(6);
    });
  });
  
  describe('Edge cases', () => {
    it('should handle empty messages gracefully', async () => {
      const context = createContext();
      const response = await expert.chat('', context);
      
      expect(response.response).toBeTruthy();
      expect(response.canRecommend).toBe(false);
    });
    
    it('should handle very long messages', async () => {
      const context = createContext();
      const longMessage = 'Quero um carro '.repeat(50) + 'até 50 mil';
      const response = await expert.chat(longMessage, context);
      
      expect(response.extractedPreferences.budget).toBe(50000);
    });
    
    it('should handle messages with typos', async () => {
      const context = createContext();
      const response = await expert.chat('kero um karro ate 50 mil pra 5 pesoas', context);
      
      expect(response.extractedPreferences.budget).toBe(50000);
      expect(response.extractedPreferences.people).toBe(5);
    });
  });
});
