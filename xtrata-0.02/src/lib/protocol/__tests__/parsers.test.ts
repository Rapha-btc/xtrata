import { describe, expect, it } from 'vitest';
import {
  bufferCV,
  listCV,
  noneCV,
  responseErrorCV,
  responseOkCV,
  someCV,
  standardPrincipalCV,
  stringAsciiCV,
  trueCV,
  tupleCV,
  uintCV
} from '@stacks/transactions';
import {
  parseGetChunk,
  parseGetChunkBatch,
  parseGetDependencies,
  parseGetAdmin,
  parseGetFeeUnit,
  parseGetInscriptionMeta,
  parseGetLastTokenId,
  parseGetNextTokenId,
  parseGetOwner,
  parseGetPendingChunk,
  parseGetRoyaltyRecipient,
  parseIsPaused,
  parseGetSvgDataUri,
  parseGetTokenUri,
  parseGetUploadState
} from '../parsers';
import { ContractCallError } from '../types';

describe('contract parsers', () => {
  it('parses last token id', () => {
    const value = responseOkCV(uintCV(12));
    expect(parseGetLastTokenId(value)).toBe(12n);
  });

  it('parses fee unit', () => {
    const value = responseOkCV(uintCV(100000));
    expect(parseGetFeeUnit(value)).toBe(100000n);
  });

  it('parses next token id', () => {
    const value = responseOkCV(uintCV(7));
    expect(parseGetNextTokenId(value)).toBe(7n);
  });

  it('parses admin and royalty recipients', () => {
    const principal = standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
    expect(parseGetAdmin(responseOkCV(principal))).toBe(
      'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    );
    expect(parseGetRoyaltyRecipient(responseOkCV(principal))).toBe(
      'SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'
    );
  });

  it('parses pause status', () => {
    const value = responseOkCV(trueCV());
    expect(parseIsPaused(value)).toBe(true);
  });

  it('parses token uri option', () => {
    const some = responseOkCV(someCV(stringAsciiCV('ipfs://token')));
    expect(parseGetTokenUri(some)).toBe('ipfs://token');

    const none = responseOkCV(noneCV());
    expect(parseGetTokenUri(none)).toBeNull();
  });

  it('parses owner option', () => {
    const principal = standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
    const value = responseOkCV(someCV(principal));
    expect(parseGetOwner(value)).toBe('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
  });

  it('parses inscription meta tuple', () => {
    const finalHash = new Uint8Array(32).fill(9);
    const tuple = tupleCV({
      owner: standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
      creator: standardPrincipalCV('SPD60B1MGZVZR8758E86SR364N95VSP13E5FHYXE'),
      'mime-type': stringAsciiCV('image/png'),
      'total-size': uintCV(8192),
      'total-chunks': uintCV(4),
      sealed: trueCV(),
      'final-hash': bufferCV(finalHash)
    });

    const parsed = parseGetInscriptionMeta(someCV(tuple));
    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error('Expected meta');
    }
    expect(parsed.owner).toBe('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B');
    expect(parsed.creator).toBe('SPD60B1MGZVZR8758E86SR364N95VSP13E5FHYXE');
    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.totalSize).toBe(8192n);
    expect(parsed.totalChunks).toBe(4n);
    expect(parsed.sealed).toBe(true);
    expect(parsed.finalHash).toEqual(finalHash);
  });

  it('parses inscription meta tuple without total chunks', () => {
    const finalHash = new Uint8Array(32).fill(4);
    const tuple = tupleCV({
      owner: standardPrincipalCV('SP2JXKMSH007NPYAQHKJPQMAQYAD90NQGTVJVQ02B'),
      'mime-type': stringAsciiCV('text/plain'),
      'total-size': uintCV(16385),
      sealed: trueCV(),
      'final-hash': bufferCV(finalHash)
    });

    const parsed = parseGetInscriptionMeta(someCV(tuple));
    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error('Expected meta');
    }
    expect(parsed.totalChunks).toBe(2n);
    expect(parsed.creator).toBeNull();
  });

  it('parses dependencies list', () => {
    const list = listCV([uintCV(1), uintCV(2), uintCV(99)]);
    expect(parseGetDependencies(list)).toEqual([1n, 2n, 99n]);
  });

  it('parses upload state tuple', () => {
    const runningHash = new Uint8Array(32).fill(1);
    const tuple = tupleCV({
      'mime-type': stringAsciiCV('image/webp'),
      'total-size': uintCV(1024),
      'total-chunks': uintCV(2),
      'current-index': uintCV(1),
      'running-hash': bufferCV(runningHash)
    });

    const parsed = parseGetUploadState(someCV(tuple));
    expect(parsed).not.toBeNull();
    if (!parsed) {
      throw new Error('Expected upload state');
    }
    expect(parsed.mimeType).toBe('image/webp');
    expect(parsed.totalSize).toBe(1024n);
    expect(parsed.totalChunks).toBe(2n);
    expect(parsed.currentIndex).toBe(1n);
    expect(parsed.runningHash).toEqual(runningHash);
  });

  it('parses optional chunks', () => {
    const buffer = new Uint8Array([1, 2, 3]);
    expect(parseGetChunk(someCV(bufferCV(buffer)))).toEqual(buffer);
    expect(parseGetPendingChunk(noneCV())).toBeNull();
  });

  it('parses chunk batch lists', () => {
    const first = new Uint8Array([7, 8]);
    const second = new Uint8Array([9]);
    const list = listCV([
      someCV(bufferCV(first)),
      noneCV(),
      someCV(bufferCV(second))
    ]);
    expect(parseGetChunkBatch(list)).toEqual([first, null, second]);
  });

  it('parses svg data uri', () => {
    const value = responseOkCV(someCV(stringAsciiCV('data:image/svg+xml;base64,AA==')));
    expect(parseGetSvgDataUri(value)).toBe('data:image/svg+xml;base64,AA==');
  });

  it('maps contract errors from responses', () => {
    const value = responseErrorCV(uintCV(100));
    try {
      parseGetLastTokenId(value);
      throw new Error('Expected parse failure');
    } catch (error) {
      if (error instanceof ContractCallError) {
        expect(error.code).toBe(100n);
        expect(error.errorName).toBe('ERR_NOT_AUTHORIZED');
        return;
      }
      throw error;
    }
  });

  it('maps paused errors from responses', () => {
    const value = responseErrorCV(uintCV(109));
    try {
      parseGetLastTokenId(value);
      throw new Error('Expected parse failure');
    } catch (error) {
      if (error instanceof ContractCallError) {
        expect(error.code).toBe(109n);
        expect(error.errorName).toBe('ERR_PAUSED');
        return;
      }
      throw error;
    }
  });
});
