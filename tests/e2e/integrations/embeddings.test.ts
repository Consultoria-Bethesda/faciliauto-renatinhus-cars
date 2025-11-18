import { describe, it, expect, beforeEach } from 'vitest';
import * as embeddings from '@/lib/embeddings';
import { createMockEmbedding } from '@tests/helpers/test-utils';

describe('OpenAI Embeddings - E2E', () => {
  describe('Generate Embedding', () => {
    it('deve gerar embedding de 1536 dimensões', async () => {
      const text = 'Fiat Argo 1.0 2023 hatch flex manual';
      const embedding = await embeddings.generateEmbedding(text);

      expect(embedding).toBeDefined();
      expect(embedding).toBeInstanceOf(Array);
      expect(embedding.length).toBe(1536);
      
      // Verificar que são números válidos
      embedding.forEach((val) => {
        expect(typeof val).toBe('number');
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      });
    }, 10000);

    it('deve gerar embeddings diferentes para textos diferentes', async () => {
      const text1 = 'Carro econômico para trabalho';
      const text2 = 'SUV espaçoso para família';

      const embedding1 = await embeddings.generateEmbedding(text1);
      const embedding2 = await embeddings.generateEmbedding(text2);

      expect(embedding1).not.toEqual(embedding2);
      
      // Calcular similaridade (deve ser baixa)
      const similarity = embeddings.cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeLessThan(0.9); // Textos diferentes devem ter baixa similaridade
    }, 10000);

    it('deve gerar embeddings similares para textos similares', async () => {
      const text1 = 'Fiat Argo para trabalho diário';
      const text2 = 'Fiat Argo uso profissional';

      const embedding1 = await embeddings.generateEmbedding(text1);
      const embedding2 = await embeddings.generateEmbedding(text2);

      const similarity = embeddings.cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeGreaterThan(0.7); // Textos similares devem ter alta similaridade
    }, 10000);

    it('deve lidar com texto vazio', async () => {
      await expect(async () => {
        await embeddings.generateEmbedding('');
      }).rejects.toThrow();
    });

    it('deve lidar com texto muito longo', async () => {
      const longText = 'palavra '.repeat(10000); // Texto muito longo
      
      // OpenAI trunca automaticamente, mas deve funcionar
      const embedding = await embeddings.generateEmbedding(longText);
      
      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(1536);
    }, 15000);
  });

  describe('Batch Generation', () => {
    it('deve gerar embeddings em batch', async () => {
      const texts = [
        'Fiat Argo 1.0',
        'Fiat Mobi 1.0',
        'Fiat Cronos 1.3',
      ];

      const embeddings = await embeddings.generateEmbeddingsBatch(texts);

      expect(embeddings).toBeDefined();
      expect(embeddings).toHaveLength(3);
      
      embeddings.forEach((emb) => {
        expect(emb.length).toBe(1536);
      });
    }, 15000);

    it('deve lidar com array vazio', async () => {
      const embeddings = await embeddings.generateEmbeddingsBatch([]);
      
      expect(embeddings).toEqual([]);
    });
  });

  describe('Cosine Similarity', () => {
    it('deve calcular similaridade entre embeddings', () => {
      const emb1 = createMockEmbedding(1536);
      const emb2 = createMockEmbedding(1536);

      const similarity = embeddings.cosineSimilarity(emb1, emb2);

      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('deve retornar 1 para embeddings idênticos', () => {
      const emb = createMockEmbedding(1536);
      const similarity = embeddings.cosineSimilarity(emb, emb);

      expect(similarity).toBeCloseTo(1, 5);
    });

    it('deve retornar ~0 para embeddings ortogonais', () => {
      const emb1 = Array(1536).fill(0).map((_, i) => i % 2 === 0 ? 1 : 0);
      const emb2 = Array(1536).fill(0).map((_, i) => i % 2 === 1 ? 1 : 0);

      const similarity = embeddings.cosineSimilarity(emb1, emb2);

      expect(Math.abs(similarity)).toBeLessThan(0.1);
    });
  });

  describe('Search Similar', () => {
    it('deve buscar embeddings mais similares', async () => {
      const query = 'carro econômico';
      const queryEmbedding = await embeddings.generateEmbedding(query);

      const items = [
        { id: '1', text: 'Fiat Mobi - econômico', embedding: await embeddings.generateEmbedding('Fiat Mobi econômico') },
        { id: '2', text: 'Fiat Toro - potente', embedding: await embeddings.generateEmbedding('Fiat Toro potente') },
        { id: '3', text: 'Fiat Argo - compacto', embedding: await embeddings.generateEmbedding('Fiat Argo compacto') },
      ];

      const results = embeddings.searchSimilar(queryEmbedding, items, 2);

      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      
      // O primeiro resultado deve ser o mais similar (Mobi econômico)
      expect(results[0].id).toBe('1');
    }, 20000);

    it('deve limitar resultados ao topK', async () => {
      const query = await embeddings.generateEmbedding('test');
      
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        text: `item ${i}`,
        embedding: createMockEmbedding(1536),
      }));

      const results = embeddings.searchSimilar(query, items, 3);

      expect(results).toHaveLength(3);
    });
  });

  describe('Serialization', () => {
    it('deve serializar embedding para string', () => {
      const embedding = createMockEmbedding(1536);
      const str = embeddings.embeddingToString(embedding);

      expect(typeof str).toBe('string');
      expect(str.length).toBeGreaterThan(100);
    });

    it('deve deserializar string para embedding', () => {
      const original = createMockEmbedding(1536);
      const str = embeddings.embeddingToString(original);
      const deserialized = embeddings.stringToEmbedding(str);

      expect(deserialized).toEqual(original);
    });

    it('deve manter precisão após serialização', () => {
      const original = [0.123456789, -0.987654321, 0.555555555];
      const str = embeddings.embeddingToString(original);
      const deserialized = embeddings.stringToEmbedding(str);

      expect(deserialized[0]).toBeCloseTo(original[0], 6);
      expect(deserialized[1]).toBeCloseTo(original[1], 6);
      expect(deserialized[2]).toBeCloseTo(original[2], 6);
    });
  });

  describe('Validation', () => {
    it('deve validar embedding correto', () => {
      const valid = createMockEmbedding(1536);
      expect(embeddings.isValidEmbedding(valid)).toBe(true);
    });

    it('deve rejeitar embedding com dimensões erradas', () => {
      const invalid = createMockEmbedding(512);
      expect(embeddings.isValidEmbedding(invalid)).toBe(false);
    });

    it('deve rejeitar embedding com valores inválidos', () => {
      const invalid = Array(1536).fill(NaN);
      expect(embeddings.isValidEmbedding(invalid)).toBe(false);
    });

    it('deve rejeitar embedding não-array', () => {
      const invalid = 'not an array';
      expect(embeddings.isValidEmbedding(invalid as any)).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('deve calcular estatísticas do embedding', () => {
      const embedding = createMockEmbedding(1536);
      const stats = embeddings.getEmbeddingStats(embedding);

      expect(stats).toHaveProperty('dimensions');
      expect(stats).toHaveProperty('magnitude');
      expect(stats).toHaveProperty('mean');
      expect(stats).toHaveProperty('min');
      expect(stats).toHaveProperty('max');

      expect(stats.dimensions).toBe(1536);
      expect(stats.magnitude).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('deve gerar embedding em menos de 1 segundo', async () => {
      const start = Date.now();
      await embeddings.generateEmbedding('Fiat Argo 1.0 2023');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    }, 5000);

    it('deve processar batch de 10 embeddings em menos de 3 segundos', async () => {
      const texts = Array.from({ length: 10 }, (_, i) => `Veículo ${i}`);
      
      const start = Date.now();
      await embeddings.generateEmbeddingsBatch(texts);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3000);
    }, 10000);
  });
});
