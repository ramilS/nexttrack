import { Test, TestingModule } from '@nestjs/testing';
import { GlobalRole } from '@prisma/client';
import { ProjectAccessService } from './project-access.service';
import { ProjectsRepository } from './projects.repository';
import { ProjectMembersRepository } from './project-members.repository';
import { UsersReader } from '@/modules/users/users.reader';

describe('ProjectAccessService', () => {
  let service: ProjectAccessService;
  let usersRepo: { findRoleById: jest.Mock };
  let projectsRepo: { findAllActiveIds: jest.Mock };
  let membersRepo: { findProjectIdsForUser: jest.Mock };

  beforeEach(async () => {
    usersRepo = { findRoleById: jest.fn().mockResolvedValue(GlobalRole.USER) };
    projectsRepo = {
      findAllActiveIds: jest.fn().mockResolvedValue(['proj-1', 'proj-2']),
    };
    membersRepo = {
      findProjectIdsForUser: jest.fn().mockResolvedValue(['proj-1']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectAccessService,
        { provide: UsersReader, useValue: usersRepo },
        { provide: ProjectsRepository, useValue: projectsRepo },
        { provide: ProjectMembersRepository, useValue: membersRepo },
      ],
    }).compile();

    service = module.get(ProjectAccessService);
  });

  it('returns every active project for a global admin', async () => {
    usersRepo.findRoleById.mockResolvedValue(GlobalRole.ADMIN);

    await expect(service.findAccessibleProjectIds('admin-1')).resolves.toEqual([
      'proj-1',
      'proj-2',
    ]);
    expect(membersRepo.findProjectIdsForUser).not.toHaveBeenCalled();
  });

  it('narrows an admin to the single requested project', async () => {
    usersRepo.findRoleById.mockResolvedValue(GlobalRole.ADMIN);

    await expect(
      service.findAccessibleProjectIds('admin-1', 'proj-2'),
    ).resolves.toEqual(['proj-2']);
    expect(projectsRepo.findAllActiveIds).not.toHaveBeenCalled();
  });

  it('returns only the projects a non-admin is a member of', async () => {
    await expect(service.findAccessibleProjectIds('user-1')).resolves.toEqual([
      'proj-1',
    ]);
    expect(membersRepo.findProjectIdsForUser).toHaveBeenCalledWith(
      'user-1',
      undefined,
    );
    expect(projectsRepo.findAllActiveIds).not.toHaveBeenCalled();
  });

  it('returns nothing for a non-admin with no memberships', async () => {
    membersRepo.findProjectIdsForUser.mockResolvedValue([]);

    await expect(service.findAccessibleProjectIds('user-1')).resolves.toEqual(
      [],
    );
  });

  it('does not treat a missing global role as admin', async () => {
    usersRepo.findRoleById.mockResolvedValue(null);

    await expect(service.findAccessibleProjectIds('ghost')).resolves.toEqual([
      'proj-1',
    ]);
    expect(projectsRepo.findAllActiveIds).not.toHaveBeenCalled();
  });
});
