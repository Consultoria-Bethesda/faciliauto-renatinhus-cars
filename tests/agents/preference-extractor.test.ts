/**
 * Tests for PreferenceExtractorAgent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PreferenceExtractorAgent } from '../../src/agents/preference-extractor.agent';

describe('PreferenceExtractorAgent', () => {
  let extractor: PreferenceExtractorAgent;
  
  beforeEach(() => {
    extractor = new PreferenceExtractorAgent();
  });
  
  describe('Single field extraction', () => {
    it('should extract budget from message', async () => {
      const message = 'Tenho até 50 mil de orçamento';
      const result = await extractor.extract(message);
      
      expect(result.extracted.budget).toBe(50000);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.fieldsExtracted).toContain('budget');
    });
    
    it('should extract people count', async () => {
      const message = 'Preciso de um carro para 5 pessoas';
      const result = await extractor.extract(message);
      
      expect(result.extracted.people).toBe(5);
      expect(result.confidence).toBeGreaterThan(0.7);
    });
    
    it('should extract usage type', async () => {
      const message = 'Vou usar principalmente para viagens';
      const result = await extractor.extract(message);
      
      expect(result.extracted.usage).toBe('viagem');
      expect(result.confidence).toBeGreaterThan(0.6);
    });
    
    it('should extract body type', async () => {
      const message = 'Prefiro SUV';
      const result = await extractor.extract(message);
      
      expect(result.extracted.bodyType).toBe('suv');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });
  
  describe('Multiple fields extraction', () => {
    it('should extract budget, people, and usage', async () => {
      const message = 'Quero um carro até 60 mil para 4 pessoas, uso na cidade';
      const result = await extractor.extract(message);
      
      expect(result.extracted.budget).toBe(60000);
      expect(result.extracted.people).toBe(4);
      expect(result.extracted.usage).toBe('cidade');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.fieldsExtracted.length).toBeGreaterThanOrEqual(3);
    });
    
    it('should extract body type, transmission, and priorities', async () => {
      const message = 'Preciso de um SUV automático e econômico';
      const result = await extractor.extract(message);
      
      expect(result.extracted.bodyType).toBe('suv');
      expect(result.extracted.transmission).toBe('automatico');
      expect(result.extracted.priorities).toContain('economico');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
    
    it('should handle complex multi-preference message', async () => {
      const message = 'Quero um SUV automático até 70 mil para viagens com 5 pessoas, preferência por Honda, nada de leilão';
      const result = await extractor.extract(message);
      
      expect(result.extracted.bodyType).toBe('suv');
      expect(result.extracted.transmission).toBe('automatico');
      expect(result.extracted.budget).toBe(70000);
      expect(result.extracted.usage).toBe('viagem');
      expect(result.extracted.people).toBe(5);
      expect(result.extracted.brand).toBe('honda');
      expect(result.extracted.dealBreakers).toContain('leilao');
      expect(result.confidence).toBeGreaterThan(0.75);
    });
  });
  
  describe('Deal breakers and constraints', () => {
    it('should extract deal breakers', async () => {
      const message = 'Nada de leilão ou muito rodado';
      const result = await extractor.extract(message);
      
      expect(result.extracted.dealBreakers).toContain('leilao');
      expect(result.extracted.dealBreakers?.some(d => 
        d.includes('quilometragem') || d.includes('rodado')
      )).toBe(true);
    });
    
    it('should extract year constraint', async () => {
      const message = 'Prefiro a partir de 2018';
      const result = await extractor.extract(message);
      
      expect(result.extracted.minYear).toBe(2018);
      expect(result.confidence).toBeGreaterThan(0.7);
    });
    
    it('should extract km constraint', async () => {
      const message = 'No máximo 80 mil km';
      const result = await extractor.extract(message);
      
      expect(result.extracted.maxKm).toBe(80000);
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });
  
  describe('Edge cases', () => {
    it('should handle greetings with no preferences', async () => {
      const message = 'Oi, tudo bem?';
      const result = await extractor.extract(message);
      
      expect(Object.keys(result.extracted).length).toBe(0);
      expect(result.confidence).toBeLessThan(0.3);
    });
    
    it('should handle vague messages', async () => {
      const message = 'Quero um carro bom';
      const result = await extractor.extract(message);
      
      // Should extract very little or nothing concrete
      expect(result.confidence).toBeLessThan(0.6);
    });
    
    it('should handle typos and informal language', async () => {
      const message = 'kero um karro ate 40 mil pra 5 pessoas';
      const result = await extractor.extract(message);
      
      expect(result.extracted.budget).toBe(40000);
      expect(result.extracted.people).toBe(5);
    });
  });
  
  describe('Context awareness', () => {
    it('should consider existing profile', async () => {
      const currentProfile = {
        budget: 50000,
        usage: 'cidade'
      };
      
      const message = 'Preciso de espaço para 6 pessoas';
      const result = await extractor.extract(message, { currentProfile });
      
      expect(result.extracted.people).toBe(6);
      // Should not override existing fields
      expect(result.extracted.budget).toBeUndefined();
    });
  });
  
  describe('Merge with profile', () => {
    it('should merge new preferences with existing profile', () => {
      const currentProfile = {
        budget: 50000,
        usage: 'cidade',
        priorities: ['economico']
      };
      
      const extracted = {
        people: 5,
        bodyType: 'suv',
        priorities: ['espaco', 'conforto']
      };
      
      const merged = extractor.mergeWithProfile(currentProfile, extracted);
      
      expect(merged.budget).toBe(50000);
      expect(merged.usage).toBe('cidade');
      expect(merged.people).toBe(5);
      expect(merged.bodyType).toBe('suv');
      expect(merged.priorities).toEqual(['economico', 'espaco', 'conforto']);
    });
    
    it('should deduplicate priorities', () => {
      const currentProfile = {
        priorities: ['economico', 'conforto']
      };
      
      const extracted = {
        priorities: ['conforto', 'espaco']
      };
      
      const merged = extractor.mergeWithProfile(currentProfile, extracted);
      
      expect(merged.priorities).toEqual(['economico', 'conforto', 'espaco']);
    });
  });
  
  describe('Budget variations', () => {
    it('should handle "até X mil"', async () => {
      const message = 'Até 55 mil';
      const result = await extractor.extract(message);
      
      expect(result.extracted.budget).toBe(55000);
    });
    
    it('should handle "entre X e Y"', async () => {
      const message = 'Entre 40 e 60 mil';
      const result = await extractor.extract(message);
      
      expect(result.extracted.budgetMin).toBe(40000);
      expect(result.extracted.budgetMax).toBe(60000);
    });
    
    it('should handle "a partir de X"', async () => {
      const message = 'A partir de 50 mil';
      const result = await extractor.extract(message);
      
      expect(result.extracted.budgetMin).toBe(50000);
    });
  });
});
