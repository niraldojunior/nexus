import KeyvSqlite from '@keyv/sqlite';
import { Injectable } from '@nestjs/common';
import { Cacheable, Keyv } from 'cacheable';
import * as fs from 'fs';

@Injectable()
export class SqliteConfig {
    getStore(): Keyv<Cacheable> {
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        return new Keyv(new KeyvSqlite('sqlite://./data/database.sqlite'));
    }
}
