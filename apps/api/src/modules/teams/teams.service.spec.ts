import { Test, TestingModule } from "@nestjs/testing";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/common/errors/domain.errors";
import { TeamsService } from "./teams.service";
import { TeamsRepository } from "./teams.repository";
import { ProjectMembersRepository } from "@/modules/projects/project-members.repository";

describe("TeamsService", () => {
  let service: TeamsService;
  let teamsRepo: Record<string, jest.Mock>;
  let membersRepo: Record<string, jest.Mock>;

  const projectId = "project-1";
  const teamId = "team-1";

  const mockTeam = {
    id: teamId,
    name: "Frontend",
    description: "Frontend team",
    projectId,
    lead: {
      id: "user-lead",
      name: "Lead",
      email: "lead@test.local",
      avatarUrl: null,
    },
    members: [
      {
        id: "user-1",
        name: "Dev 1",
        email: "dev1@test.local",
        avatarUrl: null,
        joinedAt: new Date().toISOString(),
      },
    ],
    memberCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    teamsRepo = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      existsInProject: jest.fn().mockResolvedValue(false),
      findNameInProject: jest.fn().mockResolvedValue(null),
      findCurrentName: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      findExistingMemberIds: jest.fn().mockResolvedValue([]),
      addMembers: jest.fn().mockResolvedValue(undefined),
      findMember: jest.fn().mockResolvedValue(null),
      removeMember: jest.fn().mockResolvedValue(undefined),
    };
    membersRepo = {
      isMember: jest.fn().mockResolvedValue(true),
      filterMembersByUserIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: TeamsRepository, useValue: teamsRepo },
        { provide: ProjectMembersRepository, useValue: membersRepo },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  describe("findAll", () => {
    it("should return all teams for a project", async () => {
      teamsRepo.findAll.mockResolvedValue([mockTeam]);

      const result = await service.findAll(projectId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Frontend");
      expect(result[0].memberCount).toBe(1);
    });
  });

  describe("findOne", () => {
    it("should return a team by id", async () => {
      teamsRepo.findOne.mockResolvedValue(mockTeam);

      const result = await service.findOne(projectId, teamId);

      expect(result.id).toBe(teamId);
    });

    it("should throw when team not found", async () => {
      teamsRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(projectId, "bad-id")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("create", () => {
    it("should create a team", async () => {
      teamsRepo.findNameInProject.mockResolvedValue(null);
      membersRepo.isMember.mockResolvedValue(true);
      teamsRepo.create.mockResolvedValue(mockTeam);

      const result = await service.create(projectId, {
        name: "Frontend",
        description: "Frontend team",
        leadId: "user-lead",
      });

      expect(result.name).toBe("Frontend");
      expect(teamsRepo.create).toHaveBeenCalled();
    });

    it("should reject duplicate team name", async () => {
      teamsRepo.findNameInProject.mockResolvedValue("Frontend");

      await expect(
        service.create(projectId, { name: "Frontend" }),
      ).rejects.toThrow(ConflictError);
    });

    it("should reject non-member lead", async () => {
      teamsRepo.findNameInProject.mockResolvedValue(null);
      membersRepo.isMember.mockResolvedValue(false);

      await expect(
        service.create(projectId, { name: "New Team", leadId: "non-member" }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("update", () => {
    it("should update team name", async () => {
      teamsRepo.findCurrentName.mockResolvedValue("Frontend");
      teamsRepo.findNameInProject.mockResolvedValue(null);
      teamsRepo.update.mockResolvedValue({ ...mockTeam, name: "Backend" });

      const result = await service.update(projectId, teamId, {
        name: "Backend",
      });

      expect(result.name).toBe("Backend");
    });

    it("should throw when team not found", async () => {
      teamsRepo.findCurrentName.mockResolvedValue(null);

      await expect(
        service.update(projectId, "bad-id", { name: "New" }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("remove", () => {
    it("should delete a team", async () => {
      teamsRepo.existsInProject.mockResolvedValue(true);

      await service.remove(projectId, teamId);

      expect(teamsRepo.delete).toHaveBeenCalledWith(teamId);
    });
  });

  describe("addMembers", () => {
    it("should add valid project members to team", async () => {
      teamsRepo.existsInProject.mockResolvedValue(true);
      membersRepo.filterMembersByUserIds.mockResolvedValue([
        "user-2",
        "user-3",
      ]);
      teamsRepo.findExistingMemberIds.mockResolvedValue([]);
      teamsRepo.findOne.mockResolvedValue(mockTeam);

      await service.addMembers(projectId, teamId, {
        userIds: ["user-2", "user-3"],
      });

      expect(teamsRepo.addMembers).toHaveBeenCalledWith(teamId, [
        "user-2",
        "user-3",
      ]);
    });

    it("should reject non-project members", async () => {
      teamsRepo.existsInProject.mockResolvedValue(true);
      membersRepo.filterMembersByUserIds.mockResolvedValue([]);

      await expect(
        service.addMembers(projectId, teamId, { userIds: ["non-member"] }),
      ).rejects.toThrow(ValidationError);
    });

    it("should skip already existing team members", async () => {
      teamsRepo.existsInProject.mockResolvedValue(true);
      membersRepo.filterMembersByUserIds.mockResolvedValue(["user-1"]);
      teamsRepo.findExistingMemberIds.mockResolvedValue(["user-1"]);
      teamsRepo.findOne.mockResolvedValue(mockTeam);

      await service.addMembers(projectId, teamId, { userIds: ["user-1"] });

      expect(teamsRepo.addMembers).toHaveBeenCalledWith(teamId, []);
    });
  });

  describe("removeMember", () => {
    it("should remove a team member", async () => {
      teamsRepo.existsInProject.mockResolvedValue(true);
      teamsRepo.findMember.mockResolvedValue({ teamId });

      await service.removeMember(projectId, teamId, "user-1");

      expect(teamsRepo.removeMember).toHaveBeenCalledWith(teamId, "user-1");
    });

    it("should throw when member not found", async () => {
      teamsRepo.existsInProject.mockResolvedValue(true);
      teamsRepo.findMember.mockResolvedValue(null);

      await expect(
        service.removeMember(projectId, teamId, "non-member"),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
