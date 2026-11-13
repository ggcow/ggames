import { describe, expect, it } from 'vitest';
import { campaignKey, campaignPrerequisite, MAX_LEVEL, parseCampaignKey } from '../../src/shared/games/campaign.ts';

describe('campagne : clés', () => {
  it('construit et lit les clés de niveau', () => {
    expect(campaignKey(12)).toBe('c:12');
    expect(parseCampaignKey('c:12')).toBe(12);
    expect(parseCampaignKey(campaignKey(MAX_LEVEL))).toBe(MAX_LEVEL);
  });

  it.each(['c:0', 'c:01', 'c:10000', 'l:abc123', 'x:1', ''])('rejette %s', (key) => {
    expect(parseCampaignKey(key)).toBeNull();
  });

  it('exige d’avoir gagné le niveau précédent', () => {
    expect(campaignPrerequisite('c:1')).toBeNull();
    expect(campaignPrerequisite('c:2')).toBe('c:1');
    expect(campaignPrerequisite('c:40')).toBe('c:39');
    expect(campaignPrerequisite('x:1')).toBeNull();
  });
});
