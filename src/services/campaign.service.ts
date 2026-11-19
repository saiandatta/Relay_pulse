import { randomUUID } from 'crypto';
import { ICampaignRepository, IEventRepository } from '../repositories/interfaces.js';
import { CampaignRepository } from '../repositories/campaign.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { Campaign, CreateCampaignDTO } from '../types/campaign.js';
import { AppError } from './lead.service.js';

export class CampaignService {
  constructor(
    private campaignRepo: ICampaignRepository = new CampaignRepository(),
    private eventRepo: IEventRepository = new EventRepository()
  ) {}

  createCampaign(dto: CreateCampaignDTO): Campaign {
    const id = `cmp_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const campaign = this.campaignRepo.create({ ...dto, id });

    this.eventRepo.append({
      campaignId: campaign.id,
      eventType: 'lead_created', // or system setup
      actor: 'operator',
      summary: `Created campaign: ${campaign.name} (${campaign.steps.length} sequence steps)`,
      payload: { ...dto },
    });

    return campaign;
  }

  getCampaign(id: string): Campaign {
    const campaign = this.campaignRepo.findById(id);
    if (!campaign) {
      throw new AppError(`Campaign with ID '${id}' not found`, 404);
    }
    return campaign;
  }

  listCampaigns(): Campaign[] {
    return this.campaignRepo.findAll();
  }
}

export const campaignService = new CampaignService();

