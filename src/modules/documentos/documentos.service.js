"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentosService = void 0;
var common_1 = require("@nestjs/common");
var supabase_js_1 = require("@supabase/supabase-js");
// ─── Serviço ─────────────────────────────────────────────────────────────────
var DocumentosService = function () {
    var _classDecorators = [(0, common_1.Injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var DocumentosService = _classThis = /** @class */ (function () {
        function DocumentosService_1(prisma, config) {
            this.prisma = prisma;
            this.config = config;
            this.logger = new common_1.Logger(DocumentosService.name);
            /**
             * Cliente Supabase com service_role key → acesso total ao Storage,
             * bypassando RLS. Nunca expor essa key no frontend.
             */
            this.supabase = null;
            var url = this.config.get('SUPABASE_URL');
            var key = this.config.get('SUPABASE_SERVICE_KEY');
            if (!url || !key) {
                this.logger.warn('SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados. ' +
                    'Upload de documentos estará indisponível.');
                // Não inicializa o cliente para evitar crash — operações de storage
                // retornarão erro claro quando chamadas sem as envs configuradas.
                return;
            }
            this.supabase = (0, supabase_js_1.createClient)(url, key);
        }
        // ─── Storage: operações de arquivo ────────────────────────────────────────
        /**
         * Faz upload de um arquivo para o Supabase Storage.
         *
         * Estrutura de pastas:
         *   documentos/{officeId}/{clienteId}/{processoId}/arquivo.pdf
         *   contratos/{officeId}/{clienteId}/contrato-YYYY-MM.pdf
         *   assinados/{officeId}/{envelopeId}/contrato-assinado.pdf
         *   avatars/{officeId}/{userId}/avatar.jpg
         *
         * Compatível com AWS S3: para migrar, basta substituir o client Supabase
         * por um client S3 mantendo a mesma interface de retorno.
         */
        DocumentosService_1.prototype.uploadDocumento = function (file_1, path_1) {
            return __awaiter(this, arguments, void 0, function (file, path, bucket) {
                var MAX_FILE_SIZE, _a, data, error, signedUrl;
                if (bucket === void 0) { bucket = 'documentos'; }
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!file) {
                                throw new common_1.BadRequestException('Arquivo não fornecido');
                            }
                            MAX_FILE_SIZE = 50 * 1024 * 1024;
                            if (file.size > MAX_FILE_SIZE) {
                                throw new common_1.BadRequestException("Arquivo excede o tamanho m\u00E1ximo de 50MB");
                            }
                            if (!this.supabase) {
                                throw new common_1.InternalServerErrorException('Supabase Storage não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_KEY.');
                            }
                            return [4 /*yield*/, this.supabase.storage
                                    .from(bucket)
                                    .upload(path, file.buffer, {
                                    contentType: file.mimetype,
                                    upsert: false, // não sobrescreve — garante imutabilidade
                                    cacheControl: '3600',
                                })];
                        case 1:
                            _a = _b.sent(), data = _a.data, error = _a.error;
                            if (error) {
                                this.logger.error("Erro ao fazer upload para ".concat(bucket, "/").concat(path, ":"), error);
                                throw new common_1.InternalServerErrorException("Falha no upload: ".concat(error.message));
                            }
                            return [4 /*yield*/, this.gerarUrlAssinada(data.path, bucket)];
                        case 2:
                            signedUrl = _b.sent();
                            return [2 /*return*/, {
                                    caminho: data.path,
                                    url: signedUrl,
                                    tamanho: file.size,
                                    mimeType: file.mimetype,
                                }];
                    }
                });
            });
        };
        /**
         * Gera uma URL pré-assinada para download seguro com expiração de 1 hora.
         * Equivalente ao S3 `getSignedUrl` com `expiresIn: 3600`.
         */
        DocumentosService_1.prototype.gerarUrlAssinada = function (path_1) {
            return __awaiter(this, arguments, void 0, function (path, bucket, expiresInSeconds) {
                var _a, data, error;
                var _b;
                if (bucket === void 0) { bucket = 'documentos'; }
                if (expiresInSeconds === void 0) { expiresInSeconds = 3600; }
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (!this.supabase) {
                                throw new common_1.InternalServerErrorException('Supabase Storage não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_KEY.');
                            }
                            return [4 /*yield*/, this.supabase.storage
                                    .from(bucket)
                                    .createSignedUrl(path, expiresInSeconds)];
                        case 1:
                            _a = _c.sent(), data = _a.data, error = _a.error;
                            if (error || !(data === null || data === void 0 ? void 0 : data.signedUrl)) {
                                this.logger.error("Erro ao gerar URL assinada para ".concat(bucket, "/").concat(path, ":"), error);
                                throw new common_1.InternalServerErrorException("N\u00E3o foi poss\u00EDvel gerar URL de acesso: ".concat((_b = error === null || error === void 0 ? void 0 : error.message) !== null && _b !== void 0 ? _b : 'desconhecido'));
                            }
                            return [2 /*return*/, data.signedUrl];
                    }
                });
            });
        };
        /**
         * Remove um arquivo do Supabase Storage.
         * Equivalente ao S3 `deleteObject`.
         */
        DocumentosService_1.prototype.deletarDocumento = function (path_1) {
            return __awaiter(this, arguments, void 0, function (path, bucket) {
                var error;
                if (bucket === void 0) { bucket = 'documentos'; }
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this.supabase) {
                                throw new common_1.InternalServerErrorException('Supabase Storage não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_KEY.');
                            }
                            return [4 /*yield*/, this.supabase.storage
                                    .from(bucket)
                                    .remove([path])];
                        case 1:
                            error = (_a.sent()).error;
                            if (error) {
                                this.logger.error("Erro ao deletar ".concat(bucket, "/").concat(path, ":"), error);
                                throw new common_1.InternalServerErrorException("Falha ao remover arquivo: ".concat(error.message));
                            }
                            return [2 /*return*/];
                    }
                });
            });
        };
        /**
         * Lista arquivos de um processo dentro do bucket.
         * Path esperado: `{officeId}/{clienteId}/{processoId}`
         */
        DocumentosService_1.prototype.listarArquivosStorage = function (folderPath_1) {
            return __awaiter(this, arguments, void 0, function (folderPath, bucket) {
                var _a, data, error;
                if (bucket === void 0) { bucket = 'documentos'; }
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!this.supabase) {
                                throw new common_1.InternalServerErrorException('Supabase Storage não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_KEY.');
                            }
                            return [4 /*yield*/, this.supabase.storage
                                    .from(bucket)
                                    .list(folderPath, {
                                    limit: 100,
                                    offset: 0,
                                    sortBy: { column: 'created_at', order: 'desc' },
                                })];
                        case 1:
                            _a = _b.sent(), data = _a.data, error = _a.error;
                            if (error) {
                                this.logger.error("Erro ao listar ".concat(bucket, "/").concat(folderPath, ":"), error);
                                throw new common_1.InternalServerErrorException("Falha ao listar arquivos: ".concat(error.message));
                            }
                            return [2 /*return*/, (data !== null && data !== void 0 ? data : []).map(function (file) {
                                    var _a, _b, _c, _d;
                                    return ({
                                        nome: file.name,
                                        tamanho: (_b = (_a = file.metadata) === null || _a === void 0 ? void 0 : _a.size) !== null && _b !== void 0 ? _b : 0,
                                        ultimaModificacao: (_d = (_c = file.updated_at) !== null && _c !== void 0 ? _c : file.created_at) !== null && _d !== void 0 ? _d : '',
                                    });
                                })];
                    }
                });
            });
        };
        // ─── CRUD: registros no banco (Prisma) ────────────────────────────────────
        DocumentosService_1.prototype.findAll = function (filters) {
            return __awaiter(this, void 0, void 0, function () {
                var escritorioId, processoId, tipo, status, _a, page, _b, limit, skip, where, _c, data, total;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            escritorioId = filters.escritorioId, processoId = filters.processoId, tipo = filters.tipo, status = filters.status, _a = filters.page, page = _a === void 0 ? 1 : _a, _b = filters.limit, limit = _b === void 0 ? 10 : _b;
                            skip = (page - 1) * limit;
                            where = {
                                escritorioId: escritorioId,
                                deletedAt: null,
                            };
                            if (processoId)
                                where.processoId = processoId;
                            if (tipo)
                                where.tipo = tipo;
                            if (status)
                                where.status = status;
                            return [4 /*yield*/, Promise.all([
                                    this.prisma.documento.findMany({
                                        where: where,
                                        skip: skip,
                                        take: limit,
                                        include: { processo: true },
                                        orderBy: { createdAt: 'desc' },
                                    }),
                                    this.prisma.documento.count({ where: where }),
                                ])];
                        case 1:
                            _c = _d.sent(), data = _c[0], total = _c[1];
                            return [2 /*return*/, { data: data, total: total, page: page, pages: Math.ceil(total / limit) }];
                    }
                });
            });
        };
        DocumentosService_1.prototype.findById = function (id, officeId) {
            return __awaiter(this, void 0, void 0, function () {
                var doc;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.prisma.documento.findUnique({
                                where: { id: id },
                                include: { processo: true },
                            })];
                        case 1:
                            doc = _a.sent();
                            if (!doc)
                                throw new common_1.NotFoundException('Documento não encontrado');
                            // Validar que o documento pertence ao escritório do usuário
                            if (officeId && doc.escritorioId !== officeId) {
                                throw new common_1.BadRequestException('Você não tem permissão para acessar este documento');
                            }
                            return [2 /*return*/, doc];
                    }
                });
            });
        };
        DocumentosService_1.prototype.create = function (dto, authenticatedOfficeId) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    if (!dto.escritorioId) {
                        throw new common_1.BadRequestException('escritorioId é obrigatório');
                    }
                    // Se autenticado, validar que o documento pertence ao escritório do usuário
                    if (authenticatedOfficeId && dto.escritorioId !== authenticatedOfficeId) {
                        throw new common_1.BadRequestException('Você não tem permissão para criar documentos neste escritório');
                    }
                    return [2 /*return*/, this.prisma.documento.create({
                            data: {
                                nome: dto.nome,
                                tipo: dto.tipo,
                                tamanho: dto.tamanho,
                                caminho: dto.caminho,
                                status: dto.status || 'rascunho',
                                processoId: dto.processoId,
                                escritorioId: dto.escritorioId,
                                urlAssinatura: null,
                            },
                            include: { processo: true },
                        })];
                });
            });
        };
        DocumentosService_1.prototype.update = function (id, dto) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, this.prisma.documento.update({
                            where: { id: id },
                            data: {
                                nome: dto.nome,
                                tipo: dto.tipo,
                                tamanho: dto.tamanho,
                            },
                            include: { processo: true },
                        })];
                });
            });
        };
        DocumentosService_1.prototype.remove = function (id, officeId) {
            return __awaiter(this, void 0, void 0, function () {
                var doc, updated, bucket;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.prisma.documento.findUnique({ where: { id: id } })];
                        case 1:
                            doc = _a.sent();
                            if (!doc)
                                throw new common_1.NotFoundException('Documento não encontrado');
                            // Validar que o documento pertence ao escritório do usuário
                            if (officeId && doc.escritorioId !== officeId) {
                                throw new common_1.BadRequestException('Você não tem permissão para deletar este documento');
                            }
                            return [4 /*yield*/, this.prisma.documento.update({
                                    where: { id: id },
                                    data: { deletedAt: new Date() },
                                })];
                        case 2:
                            updated = _a.sent();
                            if (!doc.caminho) return [3 /*break*/, 4];
                            bucket = this.inferirBucket(doc.caminho);
                            return [4 /*yield*/, this.deletarDocumento(doc.caminho, bucket).catch(function (err) {
                                    return _this.logger.warn("N\u00E3o foi poss\u00EDvel remover do storage: ".concat(err.message));
                                })];
                        case 3:
                            _a.sent();
                            _a.label = 4;
                        case 4: return [2 /*return*/, updated];
                    }
                });
            });
        };
        /**
         * Upload completo: envia o arquivo para o Supabase Storage e salva
         * o registro no banco com o caminho e tamanho corretos.
         *
         * Estrutura de path:
         *   documentos/{escritorioId}/{clienteId?}/{processoId}/filename-timestamp.ext
         */
        DocumentosService_1.prototype.upload = function (file, dto, authenticatedOfficeId) {
            return __awaiter(this, void 0, void 0, function () {
                var ext, nomeArquivo, pasta, path, storageResult, documento;
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            if (!file)
                                throw new common_1.BadRequestException('Arquivo não fornecido');
                            if (!dto.escritorioId) {
                                throw new common_1.BadRequestException('escritorioId é obrigatório');
                            }
                            // Se autenticado, validar que o documento pertence ao escritório do usuário
                            if (authenticatedOfficeId && dto.escritorioId !== authenticatedOfficeId) {
                                throw new common_1.BadRequestException('Você não tem permissão para fazer upload neste escritório');
                            }
                            ext = (_a = file.originalname.split('.').pop()) !== null && _a !== void 0 ? _a : '';
                            nomeArquivo = "".concat(Date.now(), "-").concat(file.originalname.replace(/\s+/g, '_'));
                            pasta = [
                                dto.escritorioId,
                                (_b = dto.clienteId) !== null && _b !== void 0 ? _b : 'sem-cliente',
                                dto.processoId,
                            ].join('/');
                            path = "".concat(pasta, "/").concat(nomeArquivo);
                            return [4 /*yield*/, this.uploadDocumento(file, path, 'documentos')];
                        case 1:
                            storageResult = _d.sent();
                            return [4 /*yield*/, this.prisma.documento.create({
                                    data: {
                                        nome: (_c = dto.nome) !== null && _c !== void 0 ? _c : file.originalname,
                                        tipo: file.mimetype,
                                        tamanho: file.size,
                                        caminho: storageResult.caminho,
                                        status: 'rascunho',
                                        processoId: dto.processoId,
                                        escritorioId: dto.escritorioId,
                                        urlAssinatura: null,
                                    },
                                    include: { processo: true },
                                })];
                        case 2:
                            documento = _d.sent();
                            return [2 /*return*/, __assign(__assign({}, documento), { urlTemporaria: storageResult.url })];
                    }
                });
            });
        };
        DocumentosService_1.prototype.findByProcesso = function (processoId) {
            return __awaiter(this, void 0, void 0, function () {
                var docs;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.prisma.documento.findMany({
                                where: { processoId: processoId, deletedAt: null },
                                orderBy: { createdAt: 'desc' },
                            })];
                        case 1:
                            docs = _a.sent();
                            // Enriquece com URLs assinadas (1h cada)
                            return [2 /*return*/, Promise.all(docs.map(function (doc) { return __awaiter(_this, void 0, void 0, function () {
                                    var caminho, bucket, urlTemporaria, _a;
                                    return __generator(this, function (_b) {
                                        switch (_b.label) {
                                            case 0:
                                                caminho = doc.caminho;
                                                if (!caminho)
                                                    return [2 /*return*/, doc];
                                                _b.label = 1;
                                            case 1:
                                                _b.trys.push([1, 3, , 4]);
                                                bucket = this.inferirBucket(caminho);
                                                return [4 /*yield*/, this.gerarUrlAssinada(caminho, bucket)];
                                            case 2:
                                                urlTemporaria = _b.sent();
                                                return [2 /*return*/, __assign(__assign({}, doc), { urlTemporaria: urlTemporaria })];
                                            case 3:
                                                _a = _b.sent();
                                                return [2 /*return*/, doc]; // retorna sem URL se falhar
                                            case 4: return [2 /*return*/];
                                        }
                                    });
                                }); }))];
                    }
                });
            });
        };
        DocumentosService_1.prototype.updateStatus = function (id, status) {
            return __awaiter(this, void 0, void 0, function () {
                var validStatuses, documento, statusOrder, currentOrder, newOrder;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            validStatuses = ['rascunho', 'final', 'assinado'];
                            if (!validStatuses.includes(status)) {
                                throw new common_1.BadRequestException("Status inv\u00E1lido: ".concat(status));
                            }
                            return [4 /*yield*/, this.prisma.documento.findUnique({ where: { id: id } })];
                        case 1:
                            documento = _b.sent();
                            if (!documento)
                                throw new common_1.NotFoundException('Documento não encontrado');
                            statusOrder = {
                                rascunho: 0,
                                final: 1,
                                assinado: 2,
                            };
                            currentOrder = statusOrder[(_a = documento.status) !== null && _a !== void 0 ? _a : 'rascunho'];
                            newOrder = statusOrder[status];
                            if (newOrder < currentOrder) {
                                throw new common_1.BadRequestException("N\u00E3o \u00E9 poss\u00EDvel reverter status de \"".concat(documento.status, "\" para \"").concat(status, "\""));
                            }
                            return [2 /*return*/, this.prisma.documento.update({
                                    where: { id: id },
                                    data: {
                                        status: status,
                                        dataAssinatura: status === 'assinado' ? new Date() : null,
                                    },
                                    include: { processo: true },
                                })];
                    }
                });
            });
        };
        // ─── Helpers ──────────────────────────────────────────────────────────────
        /**
         * Infere o bucket a partir do caminho armazenado.
         * Se o caminho contiver prefixo explícito (ex: "contratos/..."), usa-o.
         * Padrão: 'documentos'.
         */
        DocumentosService_1.prototype.inferirBucket = function (caminho) {
            var buckets = [
                'documentos',
                'contratos',
                'assinados',
                'avatars',
            ];
            for (var _i = 0, buckets_1 = buckets; _i < buckets_1.length; _i++) {
                var b = buckets_1[_i];
                if (caminho.startsWith("".concat(b, "/")))
                    return b;
            }
            return 'documentos';
        };
        return DocumentosService_1;
    }());
    __setFunctionName(_classThis, "DocumentosService");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        DocumentosService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return DocumentosService = _classThis;
}();
exports.DocumentosService = DocumentosService;
