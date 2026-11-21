import { describe, expect, it } from 'vitest';
import {
  campaignCompareKeys,
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

  it('range les niveaux par numéro, puis les autres clés par ordre alphabétique', () => {
    const keys = ['x:b', 'c:10', 'c:2', 'c:101', 'c:1', 'x:a', 'c:100'];
    expect(keys.sort(campaignCompareKeys)).toEqual(['c:1', 'c:2', 'c:10', 'c:100', 'c:101', 'x:a', 'x:b']);
    expect(campaignCompareKeys('c:3', 'c:3')).toBe(0);
    expect(campaignCompareKeys('x:a', 'x:a')).toBe(0);
  });
});

describe('campagne : progression', () => {
  const won = new Set(['c:1', 'c:2', 'c:3', 'c:10']);

  it('avance jusqu’au premier niveau non gagné, sans sauter les trous', () => {
    expect(campaignFrontier(new Set())).toBe(1);
    expect(campaignFrontier(won)).toBe(4);
  });

  it('débloque un niveau quand tous les précédents sont gagnés, et garde ouvert un niveau gagné', () => {
    expect(campaignIsUnlocked('c:1', new Set())).toBe(true);
    expect(campaignIsUnlocked('c:4', won)).toBe(true);
    expect(campaignIsUnlocked('c:5', won)).toBe(false);
    expect(campaignIsUnlocked('c:10', won)).toBe(true);
    expect(campaignIsUnlocked('c:11', won)).toBe(false);
    expect(campaignIsUnlocked('x:1', won)).toBe(false);
  });

  it('ouvre au besoin les premiers niveaux non gagnés, sans dépasser la campagne', () => {
    expect(campaignIsUnlocked('c:6', won, MAX_LEVEL, 3)).toBe(true);
    expect(campaignIsUnlocked('c:7', won, MAX_LEVEL, 3)).toBe(false);
    expect(campaignIsUnlocked('c:4', won, MAX_LEVEL, 3)).toBe(true);
    expect(campaignIsUnlocked('c:10', won, MAX_LEVEL, 3)).toBe(true);
    expect(campaignIsUnlocked('c:11', won, MAX_LEVEL, 3)).toBe(false);
    expect(campaignIsUnlocked('c:21', new Set(), 20, 30)).toBe(false);
  });

  it('saute les niveaux déjà gagnés pour compter les niveaux ouverts', () => {
    // Niveaux 1, 3 et 4 gagnés : les trois premiers à gagner sont 2, 5 et 6.
    const gaps = new Set(['c:1', 'c:3', 'c:4']);
    const open = Array.from({ length: 10 }, (_, i) => i + 1).filter((level) =>
      campaignIsUnlocked(campaignKey(level), gaps, MAX_LEVEL, 3),
    );
    expect(open).toEqual([1, 2, 3, 4, 5, 6]);
    // Tout gagné jusqu'au 98 : il ne reste que deux niveaux à ouvrir.
    const almost = new Set(Array.from({ length: 98 }, (_, i) => campaignKey(i + 1)));
    expect(campaignIsUnlocked('c:100', almost, MAX_LEVEL, 3)).toBe(true);
  });

  it('s’arrête au dernier niveau d’une campagne plus courte', () => {
    const all = new Set(Array.from({ length: 20 }, (_, i) => campaignKey(i + 1)));
    expect(parseCampaignKey('c:20', 20)).toBe(20);
    expect(parseCampaignKey('c:21', 20)).toBeNull();
    expect(campaignFrontier(all, 20)).toBe(20);
    expect(campaignFrontier(all)).toBe(21);
    expect(campaignIsUnlocked('c:21', all, 20)).toBe(false);
    expect(campaignIsUnlocked('c:21', all)).toBe(true);
  });
});
