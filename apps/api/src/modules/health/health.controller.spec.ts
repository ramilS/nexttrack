import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  const health = {
    aggregate: jest.fn(),
    readiness: jest.fn(),
    checkPostgres: jest.fn(),
    checkValkey: jest.fn(),
    checkElasticsearch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: health }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('live() returns ok without consulting the health service', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(health.readiness).not.toHaveBeenCalled();
    expect(health.checkPostgres).not.toHaveBeenCalled();
  });

  it('ready() delegates to HealthService.readiness', async () => {
    health.readiness.mockResolvedValue({ status: 'ok', services: {} });
    expect(await controller.ready()).toEqual({ status: 'ok', services: {} });
    expect(health.readiness).toHaveBeenCalledTimes(1);
  });

  it('health() delegates to HealthService.aggregate', async () => {
    health.aggregate.mockResolvedValue({ status: 'ok', services: {} });
    expect(await controller.health()).toEqual({ status: 'ok', services: {} });
    expect(health.aggregate).toHaveBeenCalledTimes(1);
  });

  describe('single-dependency probes', () => {
    it('return 200 with the service name when the dependency is up', async () => {
      health.checkPostgres.mockResolvedValue('ok');
      expect(await controller.dbHealth()).toEqual({
        status: 'ok',
        service: 'postgres',
      });
    });

    it('throw 503 ServiceUnavailable when the dependency is down', async () => {
      health.checkValkey.mockResolvedValue('down');
      await expect(controller.valkeyHealth()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
