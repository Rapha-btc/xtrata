import { Cl, ClarityType } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const faucet = accounts.get('faucet')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;
const wallet4 = accounts.get('wallet_4')!;
const wallet5 = accounts.get('wallet_5')!;
const wallet6 = accounts.get('wallet_6')!;
const wallet7 = accounts.get('wallet_7')!;
const wallet8 = accounts.get('wallet_8')!;

const contract = `${deployer}.xtrata-arcade-scores-v1-2`;

const unwrapOk = (result: any) => {
  expect(result.type).toBe(ClarityType.ResponseOk);
  return result.value;
};

const unwrapTop10 = (result: any) => {
  const listValue = unwrapOk(result);
  expect(listValue.type).toBe(ClarityType.List);
  const list = (listValue as any).list || (listValue as any).value || [];
  const entries: any[] = [];
  for (const item of list) {
    if (item.type === ClarityType.OptionalSome) {
      expect(item.value.type).toBe(ClarityType.Tuple);
      entries.push(item.value.value);
    }
  }
  return entries;
};

describe('xtrata-arcade-scores-v1.2', () => {
  it('accepts wallet submit and charges configured fee', () => {
    expect(
      simnet.callPublicFn(contract, 'set-fee-unit', [Cl.uint(100)], deployer).result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn(
        contract,
        'set-fee-recipient',
        [Cl.standardPrincipal(wallet2)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));

    const senderBefore = simnet.getAssetsMap().get('STX')?.get(wallet1) || 0n;
    const recipientBefore = simnet.getAssetsMap().get('STX')?.get(wallet2) || 0n;

    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('neon_runner'), Cl.uint(0), Cl.uint(250), Cl.stringAscii('JIM')],
        wallet1
      ).result
    ).toBeOk(Cl.uint(1));

    const senderAfter = simnet.getAssetsMap().get('STX')?.get(wallet1) || 0n;
    const recipientAfter = simnet.getAssetsMap().get('STX')?.get(wallet2) || 0n;
    expect(senderBefore - senderAfter).toBe(100n);
    expect(recipientAfter - recipientBefore).toBe(100n);

    const top1 = simnet.callReadOnlyFn(
      contract,
      'get-top10-entry',
      [Cl.stringAscii('neon_runner'), Cl.uint(0), Cl.uint(1)],
      deployer
    ).result;
    const top1Value = unwrapOk(top1);
    expect(top1Value.type).toBe(ClarityType.OptionalSome);
    const top1Tuple = (top1Value as any).value.value;
    expect(top1Tuple.player).toEqual(Cl.standardPrincipal(wallet1));
    expect(top1Tuple.name).toEqual(Cl.stringAscii('JIM'));
    expect(top1Tuple.score).toEqual(Cl.uint(250));
  });

  it('rejects score-mode submissions that are not improvements', () => {
    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('block_drop'), Cl.uint(0), Cl.uint(5000), Cl.stringAscii('ACE')],
        wallet1
      ).result
    ).toBeOk(Cl.uint(1));

    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('block_drop'), Cl.uint(0), Cl.uint(4999), Cl.stringAscii('ACE')],
        wallet1
      ).result
    ).toBeErr(Cl.uint(101));

    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('block_drop'), Cl.uint(0), Cl.uint(5000), Cl.stringAscii('ACE')],
        wallet1
      ).result
    ).toBeErr(Cl.uint(101));

    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('block_drop'), Cl.uint(0), Cl.uint(7000), Cl.stringAscii('ACE')],
        wallet1
      ).result
    ).toBeOk(Cl.uint(1));
  });

  it('requires lower times in time mode', () => {
    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('maze_escape'), Cl.uint(1), Cl.uint(5500), Cl.stringAscii('RUN')],
        wallet2
      ).result
    ).toBeOk(Cl.uint(1));

    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('maze_escape'), Cl.uint(1), Cl.uint(5600), Cl.stringAscii('RUN')],
        wallet2
      ).result
    ).toBeErr(Cl.uint(101));

    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('maze_escape'), Cl.uint(1), Cl.uint(5400), Cl.stringAscii('RUN')],
        wallet2
      ).result
    ).toBeOk(Cl.uint(1));
  });

  it('maintains top10 and rejects non-qualifying scores', () => {
    const participants = [
      deployer,
      faucet,
      wallet1,
      wallet2,
      wallet3,
      wallet4,
      wallet5,
      wallet6,
      wallet7,
      wallet8
    ];
    const scores = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];

    for (let i = 0; i < participants.length; i++) {
      expect(
        simnet.callPublicFn(
          contract,
          'submit-score',
          [
            Cl.stringAscii('snakebyte'),
            Cl.uint(0),
            Cl.uint(scores[i]),
            Cl.stringAscii(`P${String(i).padStart(2, '0')}`)
          ],
          participants[i]
        ).result
      ).toBeOk(Cl.uint(i + 1));
    }

    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('snakebyte'), Cl.uint(0), Cl.uint(50), Cl.stringAscii('LOW')],
        'ST000000000000000000002AMW42H'
      ).result
    ).toBeErr(Cl.uint(105));

    const board = simnet.callReadOnlyFn(
      contract,
      'get-top10',
      [Cl.stringAscii('snakebyte'), Cl.uint(0)],
      deployer
    ).result;
    const entries = unwrapTop10(board);
    expect(entries.length).toBe(10);
    expect(entries[0].score).toEqual(Cl.uint(1000));
    expect(entries[9].score).toEqual(Cl.uint(100));
  });

  it('validates mode, name length, score, and rank', () => {
    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('test_game'), Cl.uint(2), Cl.uint(100), Cl.stringAscii('SNA')],
        wallet1
      ).result
    ).toBeErr(Cl.uint(100));

    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('test_game'), Cl.uint(0), Cl.uint(100), Cl.stringAscii('AA')],
        wallet1
      ).result
    ).toBeErr(Cl.uint(102));

    expect(
      simnet.callPublicFn(
        contract,
        'submit-score',
        [Cl.stringAscii('test_game'), Cl.uint(0), Cl.uint(0), Cl.stringAscii('SNA')],
        wallet1
      ).result
    ).toBeErr(Cl.uint(103));

    expect(
      simnet.callReadOnlyFn(
        contract,
        'get-top10-entry',
        [Cl.stringAscii('test_game'), Cl.uint(0), Cl.uint(0)],
        deployer
      ).result
    ).toBeErr(Cl.uint(106));
  });

  it('enforces fee bounds and owner-only fee controls', () => {
    expect(simnet.callReadOnlyFn(contract, 'get-fee-unit', [], deployer).result).toBeOk(
      Cl.uint(30000)
    );

    expect(
      simnet.callPublicFn(contract, 'set-fee-unit', [Cl.uint(100)], wallet1).result
    ).toBeErr(Cl.uint(104));

    expect(
      simnet.callPublicFn(contract, 'set-fee-unit', [Cl.uint(99)], deployer).result
    ).toBeErr(Cl.uint(107));

    expect(
      simnet.callPublicFn(contract, 'set-fee-unit', [Cl.uint(1000001)], deployer).result
    ).toBeErr(Cl.uint(107));

    expect(
      simnet.callPublicFn(
        contract,
        'set-fee-recipient',
        [Cl.standardPrincipal(faucet)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));

    expect(
      simnet.callReadOnlyFn(contract, 'get-fee-recipient', [], deployer).result
    ).toBeOk(Cl.standardPrincipal(faucet));
  });

  it('allows ownership transfer and new owner controls', () => {
    expect(
      simnet.callPublicFn(
        contract,
        'transfer-contract-ownership',
        [Cl.standardPrincipal(wallet1)],
        wallet1
      ).result
    ).toBeErr(Cl.uint(104));

    expect(
      simnet.callPublicFn(
        contract,
        'transfer-contract-ownership',
        [Cl.standardPrincipal(wallet1)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));

    expect(simnet.callReadOnlyFn(contract, 'get-owner', [], deployer).result).toBeOk(
      Cl.standardPrincipal(wallet1)
    );

    expect(
      simnet.callPublicFn(contract, 'set-fee-unit', [Cl.uint(500)], deployer).result
    ).toBeErr(Cl.uint(104));

    expect(
      simnet.callPublicFn(contract, 'set-fee-unit', [Cl.uint(500)], wallet1).result
    ).toBeOk(Cl.bool(true));
  });
});
