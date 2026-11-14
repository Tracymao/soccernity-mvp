import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BANTER_ROOM_DESCRIPTION_MAX_LENGTH } from '../banter.constants';
import { CreateBanterRoomDto } from './create-banter-room.dto';

// Mirrors the global ValidationPipe (transform: true, whitelist, forbidNonWhitelisted).
async function run(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateBanterRoomDto, { name: 'Gooners Only', scopeType: 'topic', ...body });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

describe('CreateBanterRoomDto.description', () => {
  it('is optional: absent passes and stays undefined', async () => {
    const { dto, errors } = await run({});
    expect(errors).toHaveLength(0);
    expect(dto.description).toBeUndefined();
  });

  it('accepts a 1-character description', async () => {
    const { dto, errors } = await run({ description: 'a' });
    expect(errors).toHaveLength(0);
    expect(dto.description).toBe('a');
  });

  it('accepts exactly 500 characters', async () => {
    const { dto, errors } = await run({ description: 'a'.repeat(500) });
    expect(BANTER_ROOM_DESCRIPTION_MAX_LENGTH).toBe(500);
    expect(errors).toHaveLength(0);
    expect(dto.description).toHaveLength(500);
  });

  it('rejects 501 characters', async () => {
    const { errors } = await run({ description: 'a'.repeat(501) });
    expect(errors.map((e) => e.property)).toEqual(['description']);
  });

  it('trims surrounding spaces before validating and storing', async () => {
    const { dto, errors } = await run({ description: '   hello room   ' });
    expect(errors).toHaveLength(0);
    expect(dto.description).toBe('hello room');
  });

  it('counts the trimmed length: 500 characters padded with spaces still passes', async () => {
    const { dto, errors } = await run({ description: `  ${'a'.repeat(500)}  ` });
    expect(errors).toHaveLength(0);
    expect(dto.description).toHaveLength(500);
  });

  it.each(['', '   ', '\n\t '])('treats a blank description (%j) as absent, not as an error', async (blank) => {
    const { dto, errors } = await run({ description: blank });
    expect(errors).toHaveLength(0);
    expect(dto.description).toBeUndefined();
  });

  it('rejects a non-string description', async () => {
    const { errors } = await run({ description: 42 });
    expect(errors.map((e) => e.property)).toEqual(['description']);
  });

  it('leaves the other fields unchanged: a bad name still fails', async () => {
    const { errors } = await run({ name: 'x', description: 'ok' });
    expect(errors.map((e) => e.property)).toEqual(['name']);
  });
});
