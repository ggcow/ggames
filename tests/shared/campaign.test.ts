import { describe, expect, it } from 'vitest';
import {
  campaignFrontier,
  campaignIsUnlocked,
  campaignKey,
  MAX_LEVEL,
  parseCampaignKey,
} from '../../src/shared/games/campaign.ts';

describe('campagne : clés', () => {
  it('construit et lit les clés de niveau', () => {
    expect(campaignKey(12)).toBe('c:12');
    expect(parseCampaignKey('c:12')).toBe(12);
    expect(parseCampaignKey(campaignKey(MAX_LEVEL))).toBe(MAX_LEVEL);
    expect(MAX_LEVEL).toBe(100);
  });

  it.each(['c:0', 'c:01', 'c:101', 'c:1000', 'l:abc123', 'x:1', ''])('rejette %s', (key) => {
    expect(parseCampaignKey(key)).toBeNull();
  });
});

describe('campagne : progression', () => {
  const won = new Set(['c:1', 'c:2', 'c:3', 'c:10']);

  it('avance jusqu’au premier niveau non gagné, sans sauter les trous', () => {
    expect(campaignFrontier(new Set())).toBe(1);
    expect(campaignFrontier(won)).toBe(4);
  });

  it('débloque un niveau quand tous les précédents sont gagnés', () => {
    expect(campaignIsUnlocked('c:1', new Set())).toBe(true);
    expect(campaignIsUnlocked('c:4', won)).toBe(true);
    expect(campaignIsUnlocked('c:5', won)).toBe(false);
    expect(campaignIsUnlocked('c:11', won)).toBe(false);
    expect(campaignIsUnlocked('x:1', won)).toBe(false);
  });
});
