import type {
  ContactoCliente,
  ContactoClienteRepository,
} from '../domain/contacto-cliente.repository.port';
import { ObtenerContactoUseCase } from './obtener-contacto.use-case';

const contacto: ContactoCliente = {
  nombres: 'Maria',
  apellidos: 'Paredes',
  telefono: '985412305',
  email: 'mariaparedes@gmail.com',
  canal: 'WHATSAPP',
};

describe('ObtenerContactoUseCase', () => {
  it('devuelve la ficha del usuario, pidiéndola con su token', async () => {
    const repo = {
      deUsuario: jest.fn().mockResolvedValue(contacto),
      actualizar: jest.fn(),
    } satisfies jest.Mocked<ContactoClienteRepository>;
    const r = await new ObtenerContactoUseCase(repo).ejecutar('jwt', 'u1');
    expect(r).toEqual(contacto);
    expect(repo.deUsuario).toHaveBeenCalledWith('jwt', 'u1');
  });

  it('una cuenta sin ficha devuelve null', async () => {
    const repo = {
      deUsuario: jest.fn().mockResolvedValue(null),
      actualizar: jest.fn(),
    } satisfies jest.Mocked<ContactoClienteRepository>;
    expect(
      await new ObtenerContactoUseCase(repo).ejecutar('jwt', 'u2'),
    ).toBeNull();
  });
});
