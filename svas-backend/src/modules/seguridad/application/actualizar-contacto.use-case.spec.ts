import { BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  ContactoCliente,
  ContactoClienteRepository,
} from '../domain/contacto-cliente.repository.port';
import { ActualizarContactoUseCase } from './actualizar-contacto.use-case';

const antes: ContactoCliente = {
  nombres: 'Maria',
  apellidos: 'Paredes',
  telefono: '985412305',
  email: 'mariaparedes@gmail.com',
  canal: 'WHATSAPP',
};

const repoCon = (...lecturas: (ContactoCliente | null)[]) => {
  const deUsuario = jest.fn();
  for (const l of lecturas) deUsuario.mockResolvedValueOnce(l);
  return {
    deUsuario,
    actualizar: jest.fn().mockResolvedValue(undefined),
  } satisfies jest.Mocked<ContactoClienteRepository>;
};

describe('ActualizarContactoUseCase', () => {
  it('cambia el celular y devuelve la ficha ya actualizada', async () => {
    const despues = { ...antes, telefono: '911222333' };
    const repo = repoCon(antes, despues);

    const r = await new ActualizarContactoUseCase(repo).ejecutar('jwt', 'u1', {
      telefono: '911222333',
    });

    expect(r).toEqual(despues);
    expect(repo.actualizar).toHaveBeenCalledWith('u1', {
      telefono: '911222333',
    });
    expect(repo.deUsuario).toHaveBeenNthCalledWith(1, 'jwt', 'u1');
    expect(repo.deUsuario).toHaveBeenNthCalledWith(2, 'jwt', 'u1');
  });

  it('cambia solo el canal sin tocar el celular', async () => {
    const repo = repoCon(antes, { ...antes, canal: 'LLAMADA' });

    const r = await new ActualizarContactoUseCase(repo).ejecutar('jwt', 'u1', {
      canal: 'LLAMADA',
    });

    expect(r.canal).toBe('LLAMADA');
    expect(repo.actualizar).toHaveBeenCalledWith('u1', { canal: 'LLAMADA' });
  });

  it('sin nada que cambiar responde 400 y no toca la base', async () => {
    const repo = repoCon(antes);

    await expect(
      new ActualizarContactoUseCase(repo).ejecutar('jwt', 'u1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.deUsuario).not.toHaveBeenCalled();
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('una cuenta sin ficha (aún no cotizó) responde 404 y no crea nada', async () => {
    const repo = repoCon(null);

    await expect(
      new ActualizarContactoUseCase(repo).ejecutar('jwt', 'u2', {
        telefono: '911222333',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it('si la base rechaza el cambio, el error sube y no se relee la ficha', async () => {
    const repo = repoCon(antes);
    repo.actualizar.mockRejectedValue(new Error('falló'));

    await expect(
      new ActualizarContactoUseCase(repo).ejecutar('jwt', 'u1', {
        telefono: '911222333',
      }),
    ).rejects.toThrow('falló');
    expect(repo.deUsuario).toHaveBeenCalledTimes(1);
  });
});
