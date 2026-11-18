import { Test, TestingModule } from '@nestjs/testing';
import { HealthController, StartGameDayDrillDto } from './health.controller';
import {
  GameDayRunnerService,
  GameDayScenario,
  DrillStatus,
} from './gameday-runner.service';

describe('HealthController', () => {
  let controller: HealthController;
  let gamedayService: Partial<GameDayRunnerService>;

  const mockReport = {
    drillId: 'gameday-123',
    scenario: GameDayScenario.PRIMARY_DB_CRASH,
    environment: 'staging',
    triggeredBy: 'ADMIN_TRIGGER',
    startedAt: '2026-11-17T00:00:00.000Z',
    completedAt: '2026-11-17T00:00:15.000Z',
    durationMs: 15000,
    status: 'PASSED' as const,
    rto: {
      targetSeconds: 30,
      actualSeconds: 14.2,
      slaMet: true,
      unit: 'seconds',
    },
    rpo: {
      targetSeconds: 5,
      actualSeconds: 1.1,
      slaMet: true,
      unit: 'seconds',
    },
    singlePointsOfFailure: ['Single primary database replica'],
    recoveryBottlenecks: ['DNS TTL caching delay'],
    actionItems: ['Configure Multi-AZ RDS proxy'],
    stepLogs: [],
    auditSignature: 'a'.repeat(64),
  };

  beforeEach(async () => {
    gamedayService = {
      startDrill: jest.fn().mockResolvedValue({
        success: true,
        drillId: mockReport.drillId,
        status: mockReport.status,
        scenario: mockReport.scenario,
        environment: mockReport.environment,
        message: 'Disaster recovery drill completed',
        rto: mockReport.rto,
        rpo: mockReport.rpo,
        report: mockReport,
      }),
      getStatus: jest.fn().mockReturnValue({
        status: DrillStatus.IDLE,
        activeDrill: null,
        lastReport: mockReport,
        totalDrillsExecuted: 1,
        environment: 'staging',
        isEnvironmentAllowed: true,
        availableScenarios: Object.values(GameDayScenario),
        slaTargets: { rtoSeconds: 30, rpoSeconds: 5 },
      }),
      getReports: jest.fn().mockReturnValue([mockReport]),
      getReportById: jest.fn().mockImplementation((id: string) => {
        if (id === mockReport.drillId) return mockReport;
        throw new Error('Not found');
      }),
      abortDrill: jest.fn().mockReturnValue({
        aborted: true,
        drillId: mockReport.drillId,
        message: 'Drill abort requested',
      }),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: GameDayRunnerService,
          useValue: gamedayService,
        },
      ],
    }).compile();

    controller = testingModule.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /admin/gameday/start', () => {
    it('should trigger drill with provided scenario and return report', async () => {
      const dto: StartGameDayDrillDto = {
        scenario: GameDayScenario.PRIMARY_DB_CRASH,
        dryRun: true,
      };

      const result = await controller.startDrill(dto);

      expect(gamedayService.startDrill).toHaveBeenCalledWith(dto);
      expect(result.success).toBe(true);
      expect(result.drillId).toBe('gameday-123');
      expect(result.rto.slaMet).toBe(true);
      expect(result.rpo.slaMet).toBe(true);
    });

    it('should trigger drill with default options when body is empty', async () => {
      const result = await controller.startDrill();
      expect(gamedayService.startDrill).toHaveBeenCalledWith({});
      expect(result.success).toBe(true);
    });
  });

  describe('GET /admin/gameday/status', () => {
    it('should return current status and last report summary', async () => {
      const status = await controller.getStatus();
      expect(gamedayService.getStatus).toHaveBeenCalled();
      expect(status.status).toBe(DrillStatus.IDLE);
      expect(status.lastReport).toEqual(mockReport);
      expect(status.slaTargets.rtoSeconds).toBe(30);
    });

    it('should handle getStartStatus alias', async () => {
      const status = await controller.getStartStatus();
      expect(gamedayService.getStatus).toHaveBeenCalled();
      expect(status.status).toBe(DrillStatus.IDLE);
    });
  });

  describe('GET /admin/gameday/reports', () => {
    it('should return list of Game-Day audit reports', async () => {
      const result = await controller.getReports();
      expect(gamedayService.getReports).toHaveBeenCalled();
      expect(result.count).toBe(1);
      expect(result.reports[0].drillId).toBe('gameday-123');
    });

    it('should return specific report by drillId', async () => {
      const report = await controller.getReportById('gameday-123');
      expect(gamedayService.getReportById).toHaveBeenCalledWith('gameday-123');
      expect(report.drillId).toBe('gameday-123');
    });
  });

  describe('POST /admin/gameday/abort', () => {
    it('should forward abort request to runner service', async () => {
      const result = await controller.abortDrill();
      expect(gamedayService.abortDrill).toHaveBeenCalled();
      expect(result.aborted).toBe(true);
    });
  });
});
