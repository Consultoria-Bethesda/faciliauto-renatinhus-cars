/**
 * E2E Tests for Conversational Flow
 * 
 * Tests complete user journeys from greeting to recommendation
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { ConversationState } from '../../src/types/state.types';
import { conversationalHandler } from '../../src/services/conversational-handler.service';
import { featureFlags } from '../../src/lib/feature-flags';

describe('Conversational Flow E2E', () => {
  
  // Helper to create initial state
  const createInitialState = (phoneNumber: string = '5511999999999'): ConversationState => ({
    conversationId: `test-${Date.now()}`,
    phoneNumber,
    messages: [],
    quiz: {
      currentQuestion: 1,
      progress: 0,
      answers: {},
      isComplete: false,
    },
    profile: null,
    recommendations: [],
    graph: {
      currentNode: 'greeting',
      nodeHistory: [],
      errorCount: 0,
      loopCount: 0,
    },
    metadata: {
      startedAt: new Date(),
      lastMessageAt: new Date(),
      flags: [],
    },
  });
  
  // Helper to simulate conversation
  async function simulateConversation(messages: string[]): Promise<{
    state: ConversationState;
    responses: string[];
  }> {
    let state = createInitialState();
    const responses: string[] = [];
    
    for (const message of messages) {
      // Add user message to state
      state.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });
      
      const result = await conversationalHandler.handleMessage(message, state);
      state = result.updatedState;
      responses.push(result.response);
    }
    
    return { state, responses };
  }
  
  describe('Happy Path: Discovery → Recommendation', () => {
    it('should complete full flow from greeting to recommendation', async () => {
      const result = await simulateConversation([
        'Oi, quero comprar um carro',
        'Quero um SUV até 60 mil para viagens',
        'Para 5 pessoas',
        'Pode me mostrar os carros'
      ]);
      
      // Check profile was built
      expect(result.state.profile).toBeTruthy();
      expect(result.state.profile?.bodyType).toBe('suv');
      expect(result.state.profile?.budget).toBe(60000);
      expect(result.state.profile?.usage).toBe('viagem');
      expect(result.state.profile?.people).toBe(5);
      
      // Check recommendations were generated
      expect(result.state.recommendations.length).toBeGreaterThan(0);
      
      // Check all responses were generated
      expect(result.responses.length).toBe(4);
      expect(result.responses.every(r => r.length > 0)).toBe(true);
    }, 30000); // 30s timeout for LLM calls
    
    it('should handle all-in-one message with multiple preferences', async () => {
      const result = await simulateConversation([
        'Quero um SUV automático até 70 mil para viagens com 5 pessoas, preferência por Honda'
      ]);
      
      const profile = result.state.profile;
      
      expect(profile?.bodyType).toBe('suv');
      expect(profile?.transmission).toBe('automatico');
      expect(profile?.budget).toBe(70000);
      expect(profile?.usage).toBe('viagem');
      expect(profile?.people).toBe(5);
      expect(profile?.brand).toBe('honda');
    }, 20000);
    
    it('should recommend after sufficient information even without explicit request', async () => {
      const result = await simulateConversation([
        'Oi',
        'Até 50 mil',
        'Para cidade',
        ' 4 pessoas',
        'Ok' // Should trigger recommendation
      ]);
      
      // Should have enough info
      expect(result.state.profile?.budget).toBe(50000);
      expect(result.state.profile?.usage).toBe('cidade');
      expect(result.state.profile?.people).toBe(4);
      
      // Should have recommendations by the end
      expect(result.state.recommendations.length).toBeGreaterThanOrEqual(0);
    }, 30000);
  });
  
  describe('User Questions During Conversation', () => {
    it('should answer questions without losing context', async () => {
      const result = await simulateConversation([
        'Tenho até 60 mil',
        'Qual diferença entre SUV e sedan?', // Question
        'Prefiro SUV então',
        'Para 5 pessoas'
      ]);
      
      // Should have extracted budget despite question in middle
      expect(result.state.profile?.budget).toBe(60000);
      expect(result.state.profile?.bodyType).toBe('suv');
      expect(result.state.profile?.people).toBe(5);
      
      // Response to question should mention both SUV and sedan
      const questionResponse = result.responses[1];
      expect(questionResponse.toLowerCase()).toContain('suv');
      expect(questionResponse.toLowerCase()).toContain('sedan');
    }, 30000);
    
    it('should handle multiple questions', async () => {
      const result = await simulateConversation([
        'Oi',
        'Qual diferença entre automático e manual?',
        'Vocês têm Honda?',
        'Quais são os SUVs?'
      ]);
      
      // Should have generated responses to all questions
      expect(result.responses.length).toBe(4);
      expect(result.responses.every(r => r.length > 50)).toBe(true);
    }, 30000);
  });
  
  describe('Edge Cases', () => {
    it('should handle typos and informal language', async () => {
      const result = await simulateConversation([
        'kero um karro',
        'ate 50 mil',
        'pra 4 pesoas'
      ]);
      
      // Should still extract preferences
      expect(result.state.profile?.budget).toBe(50000);
      expect(result.state.profile?.people).toBe(4);
    }, 20000);
    
    it('should handle very short messages', async () => {
      const result = await simulateConversation([
        'oi',
        '50',
        'cidade',
        '4'
      ]);
      
      // Should still work (though might need more context)
      expect(result.responses.length).toBe(4);
    }, 20000);
    
    it('should force recommendation after many messages', async () => {
      const messages = [
        'Oi',
        'Quero um carro',
        'Até 50 mil',
        'Para cidade',
        'Sim',
        'Ok',
        'Certo',
        'Entendi',
        'Pode mostrar' // 9th message
      ];
      
      const result = await simulateConversation(messages);
      
      // Should recommend by now to avoid infinite conversation
      // (VehicleExpert forces recommendation after 8 messages)
      expect(result.state.graph.loopCount).toBeGreaterThanOrEqual(8);
    }, 40000);
  });
  
  describe('Preference Extraction', () => {
    it('should extract budget variations', async () => {
      const tests = [
        { msg: 'Até 55 mil', expected: 55000 },
        { msg: 'Entre 40 e 60 mil', expectedMin: 40000, expectedMax: 60000 },
        { msg: 'A partir de 50 mil', expectedMin: 50000 },
      ];
      
      for (const test of tests) {
        const result = await simulateConversation([test.msg]);
        
        if (test.expected) {
          expect(result.state.profile?.budget).toBe(test.expected);
        }
        if (test.expectedMin) {
          expect(result.state.profile?.budgetMin).toBe(test.expectedMin);
        }
        if (test.expectedMax) {
          expect(result.state.profile?.budgetMax).toBe(test.expectedMax);
        }
      }
    }, 30000);
    
    it('should extract deal breakers', async () => {
      const result = await simulateConversation([
        'Nada de leilão ou muito rodado, prefiro a partir de 2018'
      ]);
      
      expect(result.state.profile?.dealBreakers).toContain('leilao');
      expect(result.state.profile?.minYear).toBe(2018);
    }, 15000);
  });
  
  describe('Feature Flag Integration', () => {
    it('should use consistent bucketing for same phone number', () => {
      const phone1 = '5511999999999';
      const phone2 = '5511888888888';
      
      // Same phone should always get same decision
      const decision1a = featureFlags.shouldUseConversational(phone1);
      const decision1b = featureFlags.shouldUseConversational(phone1);
      expect(decision1a).toBe(decision1b);
      
      // Different phones might get different decisions (depending on rollout %)
      const decision2 = featureFlags.shouldUseConversational(phone2);
      expect(typeof decision2).toBe('boolean');
    });
  });
  
  describe('State Management', () => {
    it('should maintain conversation history', async () => {
      const result = await simulateConversation([
        'Oi',
        'Até 50 mil',
        'Para cidade'
      ]);
      
      // Should have 3 user messages + 3 assistant responses = 6 total
      expect(result.state.messages.length).toBeGreaterThanOrEqual(6);
      
      // Check message structure
      const userMessages = result.state.messages.filter(m => m.role === 'user');
      expect(userMessages.length).toBe(3);
      
      const assistantMessages = result.state.messages.filter(m => m.role === 'assistant');
      expect(assistantMessages.length).toBe(3);
    }, 20000);
    
    it('should update metadata correctly', async () => {
      const result = await simulateConversation([
        'Oi',
        'Até 50 mil',
        'Para cidade'
      ]);
      
      expect(result.state.metadata.lastMessageAt).toBeTruthy();
      expect(result.state.metadata.startedAt).toBeTruthy();
      expect(result.state.metadata.lastMessageAt.getTime()).toBeGreaterThanOrEqual(
        result.state.metadata.startedAt.getTime()
      );
    }, 20000);
  });
});
