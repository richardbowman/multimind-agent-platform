import { expect } from 'chai';
import LanceDBService from '../llm/lancedbService';
import { IEmbeddingService, ILLMService } from '../llm/ILLMService';
import { FilterCriteria } from '../types/FilterCriteria';

describe('LanceDBService - buildWhereClause', () => {
    let service: LanceDBService;
    const mockEmbeddingService = {} as IEmbeddingService;
    const mockLLMService = {} as ILLMService;

    beforeEach(() => {
        service = new LanceDBService(mockEmbeddingService, mockLLMService);
    });

    it('should handle simple equality', () => {
        const where: FilterCriteria = { type: 'document' };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("type = 'document'");
    });

    it('should handle $eq operator', () => {
        const where: FilterCriteria = { type: { $eq: 'document' } };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("type = 'document'");
    });

    it('should handle $ne operator', () => {
        const where: FilterCriteria = { type: { $ne: 'document' } };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("type != 'document'");
    });

    it('should handle $in operator with strings', () => {
        const where: FilterCriteria = { type: { $in: ['document', 'spreadsheet'] } };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("type IN ('document', 'spreadsheet')");
    });

    it('should handle $in operator with numbers', () => {
        const where: FilterCriteria = { count: { $in: [1, 2, 3] } };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("count IN (1, 2, 3)");
    });

    it('should handle $nin operator', () => {
        const where: FilterCriteria = { type: { $nin: ['document', 'spreadsheet'] } };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("type NOT IN ('document', 'spreadsheet')");
    });

    it('should handle $gt operator', () => {
        const where: FilterCriteria = { count: { $gt: 10 } };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("count > 10");
    });

    it('should handle $gte operator', () => {
        const where: FilterCriteria = { count: { $gte: 10 } };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("count >= 10");
    });

    it('should handle $lt operator', () => {
        const where: FilterCriteria = { count: { $lt: 10 } };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("count < 10");
    });

    it('should handle $lte operator', () => {
        const where: FilterCriteria = { count: { $lte: 10 } };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("count <= 10");
    });

    it('should handle $and operator', () => {
        const where: FilterCriteria = {
            $and: [
                { type: 'document' },
                { subtype: 'report' }
            ]
        };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("(type = 'document' AND subtype = 'report')");
    });

    it('should handle $or operator', () => {
        const where: FilterCriteria = {
            $or: [
                { type: 'document' },
                { type: 'spreadsheet' }
            ]
        };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("(type = 'document' OR type = 'spreadsheet')");
    });

    it('should handle $not operator', () => {
        const where: FilterCriteria = {
            $not: { type: 'document' }
        };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("NOT (type = 'document')");
    });

    it('should handle nested $and and $or operators', () => {
        const where: FilterCriteria = {
            $and: [
                { type: 'document' },
                {
                    $or: [
                        { subtype: 'report' },
                        { subtype: 'summary' }
                    ]
                }
            ]
        };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("(type = 'document' AND (subtype = 'report' OR subtype = 'summary'))");
    });

    it('should handle complex combinations of operators', () => {
        const where: FilterCriteria = {
            $and: [
                { type: { $in: ['document', 'spreadsheet'] } },
                {
                    $or: [
                        { count: { $gt: 10 } },
                        { count: { $lt: 5 } }
                    ]
                },
                { status: { $ne: 'archived' } }
            ]
        };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal(
            "(type IN ('document', 'spreadsheet') AND (count > 10 OR count < 5) AND status != 'archived')"
        );
    });

    it('should handle empty where clause', () => {
        const where: FilterCriteria = {};
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("");
    });

    it('should handle multiple conditions on same field', () => {
        const where: FilterCriteria = {
            count: { $gt: 5, $lt: 10 }
        };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("count > 5 AND count < 10");
    });

    it('should handle artifactId with $in operator', () => {
        const where: FilterCriteria = {
            artifactId: { $in: ['id1', 'id2', 'id3'] }
        };
        const result = (service as any).buildWhereClause(where);
        expect(result).to.equal("artifactId IN ('id1', 'id2', 'id3')");
    });
});
