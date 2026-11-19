import { describe, it, expect } from 'vitest';
import { LLMService } from '../src/services/llm.service.js';
import { Lead } from '../src/types/lead.js';

describe('Lead Qualification & Scoring Engine', () => {
  const llmService = new LLMService();

  function makeMockLead(overrides: Partial<Lead> = {}): Lead {
    return {
      id: 'lead_test_001',
      campaignId: null,
      firstName: 'Jordan',
      lastName: 'Bell',
      email: 'jordan@cloudscale.io',
      company: 'CloudScale',
      role: 'Sales Manager',
      companySize: '51-200',
      painPoints: 'Slow lead response times',
      engagementNotes: 'Requested pricing page',
      status: 'new',
      score: 0,
      intentTier: 'cold',
      currentStep: 0,
      nextActionAt: null,
      qualificationSummary: null,
      lastContactedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('awards high score (>= 80) and HOT tier for C-Level / VP at ideal ICP company size with speed-to-lead pain points', async () => {
    const lead = makeMockLead({
      role: 'Chief Revenue Officer',
      companySize: '51-200',
      painPoints: 'Speed to lead latency and SDR conversion rate dropping',
      engagementNotes: 'Requested enterprise demo consultation',
    });

    const result = await llmService.qualifyLead(lead);

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.intentTier).toBe('hot');
    expect(result.suggestedNextStep).toBe(1);
    expect(result.keyFactors).toContain('Executive/C-Level Decision Maker (+35)');
    expect(result.summary).toContain('HOT');
  });

  it('assigns WARM tier for Director level at mid-size company with general pain points', async () => {
    const lead = makeMockLead({
      role: 'Director of Business Development',
      companySize: '11-50',
      painPoints: 'Looking to optimize outbound cadence',
      engagementNotes: null,
    });

    const result = await llmService.qualifyLead(lead);

    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(80);
    expect(result.intentTier).toBe('warm');
  });

  it('assigns COLD tier for lower seniority with minimal pain point data', async () => {
    const lead = makeMockLead({
      role: 'Account Executive',
      companySize: '1-10',
      painPoints: null,
      engagementNotes: null,
    });

    const result = await llmService.qualifyLead(lead);

    expect(result.score).toBeGreaterThanOrEqual(35);
    expect(result.score).toBeLessThan(60);
    expect(result.intentTier).toBe('cold');
  });

  it('disqualifies leads with student/intern roles or competitor signals', async () => {
    const lead = makeMockLead({
      role: 'Student Intern',
      email: 'student@university.fake',
      companySize: '1-10',
      painPoints: 'None',
      engagementNotes: 'Class project research',
    });

    const result = await llmService.qualifyLead(lead);

    expect(result.score).toBeLessThanOrEqual(25);
    expect(result.intentTier).toBe('disqualified');
  });

  it('strictly bounds scores within [0, 100]', async () => {
    // Ultra-stacked lead
    const superLead = makeMockLead({
      role: 'Founder & CEO & CRO & VP of Sales',
      companySize: '201-1000',
      painPoints: 'speed to lead pipeline conversion inbound sdr ramp budget',
      engagementNotes: 'demo pricing urgent budget confirmed',
    });

    const result = await llmService.qualifyLead(superLead);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
