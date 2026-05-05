import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzePlanForIndexes, getQueryImpactScore } from './monitoring';

describe('Schema Optimization Logic (Phase 137)', () => {
    describe('analyzePlanForIndexes', () => {
        it('should detect sequential scans in PostgreSQL plans', () => {
            const mockPlan = [
                {
                    "Plan": {
                        "Node Type": "Seq Scan",
                        "Relation Name": "users",
                        "Filter": "(email = 'test@example.com')",
                        "Plans": []
                    }
                }
            ];

            const recs = analyzePlanForIndexes(mockPlan, 'postgresql');
            assert.strictEqual(recs.length, 1);
            assert.strictEqual(recs[0].table, 'users');
            assert.strictEqual(recs[0].column, 'email');
            assert.ok(recs[0].suggestedSql.includes('CREATE INDEX CONCURRENTLY'));
        });

        it('should detect full table scans in MySQL plans', () => {
            const mockPlan = [
                {
                    "query_block": {
                        "table": {
                            "table_name": "products",
                            "access_type": "ALL",
                            "attached_condition": "category_id = 5"
                        }
                    }
                }
            ];

            const recs = analyzePlanForIndexes(mockPlan, 'mysql');
            assert.strictEqual(recs.length, 1);
            assert.strictEqual(recs[0].table, 'products');
            assert.strictEqual(recs[0].column, 'category_id');
            assert.ok(recs[0].suggestedSql.includes('CREATE INDEX `idx_products_category_id_auto`'));
        });

        it('should handle nested plans in PostgreSQL', () => {
            const mockPlan = [
                {
                    "Plan": {
                        "Node Type": "Nested Loop",
                        "Plans": [
                            {
                                "Node Type": "Seq Scan",
                                "Relation Name": "orders",
                                "Filter": "(user_id = 10)"
                            },
                            {
                                "Node Type": "Index Scan",
                                "Relation Name": "users"
                            }
                        ]
                    }
                }
            ];

            const recs = analyzePlanForIndexes(mockPlan, 'postgresql');
            assert.strictEqual(recs.length, 1);
            assert.strictEqual(recs[0].table, 'orders');
            assert.strictEqual(recs[0].column, 'user_id');
        });
    });

    describe('getQueryImpactScore', () => {
        it('should calculate impact based on latency and frequency', () => {
            const score = getQueryImpactScore(150, 100);
            assert.strictEqual(score, 15000);
        });

        it('should round the impact score', () => {
            const score = getQueryImpactScore(150.7, 10);
            assert.strictEqual(score, 1507);
        });
    });
});
