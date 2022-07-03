/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import HttpStatus from 'http-status-codes';
import { inject } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import axiosRetry, { exponentialDelay, IAxiosRetryConfig } from 'axios-retry';
import { SERVICES } from '../../common/constants';
import { ConflictError, NotFoundError, BadRequestError, InternalServerError } from '@map-colonies/error-types';
import { HttpError } from '@map-colonies/error-express-handler';

export abstract class HttpClient {
  protected targetService = '';
  protected axiosOptions: AxiosRequestConfig = {};
  protected axiosClient: AxiosInstance;

  public constructor(@inject(SERVICES.LOGGER) protected readonly logger: Logger, retryConfig?: IAxiosRetryConfig) {
    this.axiosClient = axios.create();
    if (!retryConfig) {
      retryConfig = {
        retries: 0,
      };
    }
    const delayFunc = retryConfig.retryDelay ?? ((): number => 0);
    retryConfig.retryDelay = (retryCount: number, error: AxiosError): number => {
      this.logger.error(`error from ${this.targetService}. retries: ${retryCount}. error: ${error.message}`);
      return delayFunc(retryCount, error);
    };
    axiosRetry(this.axiosClient, retryConfig);
  }

  protected async get<T>(url: string, queryParams?: Record<string, unknown>, retryConfig?: IAxiosRetryConfig): Promise<T> {
    try {
      const reqConfig = retryConfig ? { ...this.axiosOptions, 'axios-retry': retryConfig } : { ...this.axiosOptions };
      reqConfig.params = queryParams;
      const res = await this.axiosClient.get<T>(url, reqConfig);
      return res.data;
    } catch (err) {
      const error = this.wrapError(url, err);
      throw error;
    }
  }

  protected async post<T>(url: string, body?: unknown, retryConfig?: IAxiosRetryConfig): Promise<T> {
    try {
      const reqConfig = retryConfig ? { ...this.axiosOptions, 'axios-retry': retryConfig } : this.axiosOptions;
      const res = await this.axiosClient.post<T>(url, body, reqConfig);
      return res.data;
    } catch (err) {
      const error = this.wrapError(url, err, body);
      throw error;
    }
  }

  protected async put<T>(url: string, body?: unknown, retryConfig?: IAxiosRetryConfig): Promise<T> {
    try {
      const reqConfig = retryConfig ? { ...this.axiosOptions, 'axios-retry': retryConfig } : this.axiosOptions;
      const res = await this.axiosClient.put<T>(url, body, reqConfig);
      return res.data;
    } catch (err) {
      const error = this.wrapError(url, err, body);
      throw error;
    }
  }

  private wrapError(url: string, err: AxiosError, body?: unknown): HttpError {
    switch (err.response?.status) {
      case HttpStatus.BAD_REQUEST:
        if (body !== undefined) {
          body = JSON.stringify(body);
          this.logger.debug(`invalid request sent to ${this.targetService} at ${url}. body: ${body as string}. error: ${err.message}`);
        } else {
          this.logger.debug(`invalid request sent to ${this.targetService} at ${url}. error: ${err.message}`);
        }
        return new BadRequestError(err);
      case HttpStatus.NOT_FOUND:
        this.logger.debug(`request url not found for service ${this.targetService}, target url: ${url}, error: ${err.message}`);
        return new NotFoundError(err);
      case HttpStatus.CONFLICT:
        this.logger.debug(`request url conflicted, for service ${this.targetService}, target url: ${url}, error: ${err.message}`);
        return new ConflictError(err);
      default:
        if (body !== undefined) {
          body = JSON.stringify(body);
          this.logger.error(`error from ${this.targetService} at ${url}. body: ${body as string}. error: ${err.message}`);
        } else {
          this.logger.error(`error from ${this.targetService} at ${url}. error: ${err.message}`);
        }
        return new InternalServerError(err);
    }
  }
}

export interface IHttpRetryConfig {
  attempts: number;
  delay: number | 'exponential';
  shouldResetTimeout: boolean;
}

export function parseConfig(config: IHttpRetryConfig): IAxiosRetryConfig {
  const retries = config.attempts - 1;
  if (retries <= 0) {
    throw new Error('invalid retry configuration: attempts must be positive');
  }
  let delay: (attempt: number) => number;
  if (config.delay === 'exponential') {
    delay = exponentialDelay;
  } else if (typeof config.delay === 'number') {
    delay = (): number => {
      return config.delay as number;
    };
  } else {
    throw new Error('invalid retry configuration: delay must be "exponential" or number');
  }
  return {
    retries: retries,
    retryDelay: delay,
    shouldResetTimeout: config.shouldResetTimeout,
  };
}
